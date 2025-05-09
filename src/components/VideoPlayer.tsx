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

    // Get the progress control element
    const progressControl = player.el().querySelector('.vjs-progress-control');
    if (!progressControl) return;

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
      const highlight = document.createElement('div');
      highlight.className = 'vjs-time-range-highlight';
        progressControl.querySelector('.vjs-progress-holder')?.appendChild(highlight);
        highlightRefs.current[index] = highlight;

    const duration = player.duration();
    if (!duration || duration <= 0) return;

        const startPercent = (range.startSeconds / duration) * 100;
        const endPercent = (range.endSeconds / duration) * 100;
    const widthPercent = endPercent - startPercent;

        highlight.style.left = `${startPercent}%`;
        highlight.style.width = `${widthPercent}%`;
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

      // Update highlights on time updates
      player.on('timeupdate', () => {
        updateTimeRangeHighlights(player);
      });

    } else if (playerRef.current) {
      // Update player if sources change
      const player = playerRef.current;
      player.src(options.sources);

      // Update time range highlights when sources change
      player.on('loadedmetadata', () => {
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
