/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import type Player from 'video.js/dist/types/player';
import 'videojs-youtube';

// Add custom CSS for better time display and time range highlighting
const customStyles = `
.video-js .vjs-time-control {
  display: block !important;
}
.video-js .vjs-current-time {
  display: block !important;
  padding-right: 0;
}
.video-js .vjs-duration {
  display: block !important;
}
.video-js .vjs-time-divider {
  display: block !important;
}
.video-js .vjs-remaining-time {
  display: none !important;
}

/* Time range highlight styles */
.vjs-time-range-highlight {
  position: absolute;
  height: 100%;
  background-color: rgba(255, 204, 0, 0.3);
  pointer-events: none;
  z-index: 1;
  border-left: 2px solid rgba(255, 204, 0, 0.7);
  border-right: 2px solid rgba(255, 204, 0, 0.7);
}

.vjs-progress-control:hover .vjs-time-range-highlight {
  background-color: rgba(255, 204, 0, 0.5);
}
`;

interface VideoPlayerProps {
  options: {
    autoplay?: boolean;
    controls?: boolean;
    responsive?: boolean;
    fluid?: boolean;
    controlBar?: Record<string, unknown>;
    sources: {
      src: string;
      type?: string;
    }[];
  };
  timestampRanges?: Array<{ startSeconds: number | null; endSeconds: number | null }>;
  onReady?: (player: Player) => void;
}

const VideoPlayer = ({
  options,
  timestampRanges = [],
  onReady,
}: VideoPlayerProps) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const highlightRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Add custom CSS to document
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = customStyles;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Function to create and update time range highlights
  const updateTimeRangeHighlights = (player: Player) => {
    if (!player) return;

    // console.log('Updating time range highlights, count:', timestampRanges.length);
    
    // Only continue if we have ranges to display and player is ready
    if (timestampRanges.length === 0) {
    //   console.log('No timestamp ranges to highlight');
      return;
    }
    
    const duration = player.duration();
    if (!duration || duration <= 0) {
      console.log('Cannot update highlights: Invalid duration:', duration);
      return;
    }

    // Get the progress control element
    const progressControl = player.el().querySelector('.vjs-progress-control');
    if (!progressControl) {
      console.log('Progress control not found');
      return;
    }
    
    const progressHolder = progressControl.querySelector('.vjs-progress-holder');
    if (!progressHolder) {
      console.log('Progress holder not found');
      return;
    }

    // Clear existing highlights
    highlightRefs.current.forEach(ref => {
      if (ref && ref.parentNode) {
        ref.parentNode.removeChild(ref);
      }
    });
    highlightRefs.current = [];

    // Create new highlights for each timestamp range
    timestampRanges.forEach((range, index) => {
      if (range.startSeconds !== null && range.endSeconds !== null) {
        try {
          console.log(`Processing range ${index}:`, range);
          
          // Validate range values
          if (range.startSeconds < 0 || range.endSeconds <= range.startSeconds || range.endSeconds > duration) {
            console.log(`Invalid range values for index ${index}:`, range);
            return; // Skip this range
          }
          
          // Create highlight element
          const highlight = document.createElement('div');
          highlight.className = 'vjs-time-range-highlight';
          
          // Keep all highlights yellow
          highlight.style.backgroundColor = 'rgba(255, 204, 0, 0.5)';
          highlight.style.borderLeft = '2px solid rgba(255, 204, 0, 0.8)';
          highlight.style.borderRight = '2px solid rgba(255, 204, 0, 0.8)';
          
          // Calculate position
          const startPercent = (range.startSeconds / duration) * 100;
          const endPercent = (range.endSeconds / duration) * 100;
          const widthPercent = endPercent - startPercent;
          
          highlight.style.left = `${startPercent}%`;
          highlight.style.width = `${widthPercent}%`;
          
          // Add to DOM
          progressHolder.appendChild(highlight);
          highlightRefs.current[index] = highlight;
          
          console.log(`Added highlight ${index}: left=${startPercent}%, width=${widthPercent}%`);
        } catch (error) {
          console.error(`Error creating highlight for range ${index}:`, error);
        }
      }
    });
  };

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current && videoRef.current) {
      // Initialize the Video.js player
      const videoElement = document.createElement('video-js');
      videoElement.classList.add('vjs-big-play-centered');
      videoRef.current.appendChild(videoElement);

      const defaultOptions = {
        techOrder: ['youtube', 'html5'],
        youtube: { enablejsapi: 1 },
        controlBar: {
          currentTimeDisplay: true,
          timeDivider: true,
          durationDisplay: true,
          remainingTimeDisplay: false,
          progressControl: {
            seekBar: true,
          },
        },
      };

      const player = videojs(
        videoElement,
        {
          ...defaultOptions,
          ...options,
        },
        () => {
          if (onReady && playerRef.current) {
            onReady(playerRef.current);
          }
        }
      );

      playerRef.current = player;

      // Force time display to be visible through class modification
      player.on('loadedmetadata', () => {
        // Use querySelector to directly modify the elements
        const playerElement = player.el();
        const timeControls =
          playerElement.querySelectorAll('.vjs-time-control');
        timeControls.forEach((el) => {
          (el as HTMLElement).style.display = 'block';
        });

        // Update the time range highlights
        updateTimeRangeHighlights(player);
      });

      // Update highlights on time updates and when duration changes
      player.on('timeupdate', () => {
        updateTimeRangeHighlights(player);
      });
      
      player.on('durationchange', () => {
        updateTimeRangeHighlights(player);
      });

    } else if (playerRef.current) {
      // Update player if sources change
      const player = playerRef.current;
      player.src(options.sources);

      // Update time range highlights when sources change
      player.one('loadedmetadata', () => {
        updateTimeRangeHighlights(player);
      });
    }
  }, [options, onReady, timestampRanges]);

  // Update highlights when timestamp ranges change
  useEffect(() => {
    if (playerRef.current) {
      updateTimeRangeHighlights(playerRef.current);
    }
  }, [timestampRanges]);

  // Dispose the player on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
        highlightRefs.current = [];
      }
    };
  }, []);

  return (
    <div data-vjs-player>
      <div ref={videoRef} className="w-full aspect-video" />
    </div>
  );
};

export default VideoPlayer;
