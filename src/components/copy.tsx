import { useState, useCallback, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import type Player from 'video.js/dist/types/player';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '../ui/card';
import {
  Timeline,
  useKeyboardShortcuts,
  useTimelineDataInitializer,
  useTimelineDataStore,
  Player as SalinaPlayer,
} from '@salina-app/media-editor';

// Function to detect YouTube URL pattern
const isYoutubeUrl = (url: string): boolean => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return youtubeRegex.test(url);
};

// Function to convert YouTube URL to proper format for VideoJS
const getYoutubeId = (url: string): string | null => {
  const regExp =
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[7].length === 11 ? match[7] : null;
};

// Function to convert time string to seconds
const timeToSeconds = (timeStr: string): number | null => {
  if (!timeStr) return null;

  // Handle different time formats: HH:MM:SS, MM:SS, or SS
  const parts = timeStr.split(':').map((part) => parseInt(part, 10));

  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    // SS format
    return parts[0];
  }

  return null;
};

interface TimestampRange {
  start: string;
  end: string;
  startSeconds: number | null;
  endSeconds: number | null;
  label?: string; // Optional label for the timestamp
}

interface VideoPlayerContainerProps {
  initialVideoUrl?: string;
  initialSingleSegmentMode?: boolean;
  initialTimestampRanges?: TimestampRange[];
  onSingleSegmentModeChange?: (isSingleSegment: boolean) => void;
  onActiveSegmentChange?: (index: number) => void;
  onTimestampRangesChange?: (ranges: TimestampRange[]) => void;
}

const VideoPlayerContainer = ({
  initialVideoUrl = '',
  initialSingleSegmentMode = false,
  initialTimestampRanges = [{ start: '', end: '', startSeconds: null, endSeconds: null, label: '' }],
  onSingleSegmentModeChange,
  onActiveSegmentChange,
  onTimestampRangesChange
}: VideoPlayerContainerProps) => {
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [timestampRanges, setTimestampRanges] = useState<TimestampRange[]>(initialTimestampRanges);
  const [player, setPlayer] = useState<Player | null>(null);
  // Track whether we're in single segment mode (when user clicks a segment)
  const [singleSegmentMode, setSingleSegmentMode] = useState(initialSingleSegmentMode);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);

  // Callback handlers for state changes
  const handleSingleSegmentModeChange = useCallback((newMode: boolean) => {
    setSingleSegmentMode(newMode);
    if (onSingleSegmentModeChange) {
      onSingleSegmentModeChange(newMode);
    }
  }, [onSingleSegmentModeChange]);

  const handleActiveSegmentChange = useCallback((index: number) => {
    setActiveSegmentIndex(index);
    if (onActiveSegmentChange) {
      onActiveSegmentChange(index);
    }
  }, [onActiveSegmentChange]);

  const handleTimestampRangesChange = useCallback((ranges: TimestampRange[]) => {
    setTimestampRanges(ranges);
    if (onTimestampRangesChange) {
      onTimestampRangesChange(ranges);
    }
  }, [onTimestampRangesChange]);

  const handleLoadVideo = useCallback(() => {
    if (videoUrl) {
      // Convert start and end times to seconds for all ranges
      const updatedRanges = timestampRanges.map(range => {
        const startSec = timeToSeconds(range.start);
        const endSec = timeToSeconds(range.end);
        return { ...range, startSeconds: startSec, endSeconds: endSec };
      });
      handleTimestampRangesChange(updatedRanges);

      // Set the current video URL last to trigger player update
      setCurrentVideoUrl(videoUrl);
    }
  }, [videoUrl, timestampRanges, handleTimestampRangesChange]);

  const getVideoSource = useCallback(() => {
    if (!currentVideoUrl) return [];

    if (isYoutubeUrl(currentVideoUrl)) {
      const youtubeId = getYoutubeId(currentVideoUrl);
      if (youtubeId) {
        // For YouTube videos, we need to use the standard watch URL to have better control over timestamps
        // rather than the embed URL which might not work as expected with our timestamp control logic
        return [
          {
            src: `https://www.youtube.com/watch?v=${youtubeId}`,
            type: 'video/youtube',
          },
        ];
      }
    }

    // For direct video URLs, try to determine type or default to mp4
    return [
      {
        src: currentVideoUrl,
        type: currentVideoUrl.includes('.mp4')
          ? 'video/mp4'
          : currentVideoUrl.includes('.webm')
          ? 'video/webm'
          : currentVideoUrl.includes('.ogg')
          ? 'video/ogg'
          : 'video/mp4',
      },
    ];
  }, [currentVideoUrl]);

  // Apply time controls when player or time values change
  useEffect(() => {
    if (!player) return; // We'll handle both direct and YouTube videos here

    // For videos, handle multiple timestamp ranges
    if (timestampRanges.length > 0) {
      // Filter out invalid ranges
      const validRanges = timestampRanges.filter(range => 
        range.startSeconds !== null && 
        range.endSeconds !== null &&
        range.start.trim() !== '' &&
        range.end.trim() !== ''
      );
      
      if (validRanges.length === 0) return;

      // Sort ranges by start time
      validRanges.sort((a, b) => (a.startSeconds || 0) - (b.startSeconds || 0));

      // Track current segment index
      let currentSegmentIndex = 0;

      // Initialize to first segment when video loads
      const initializeSegment = () => {
        const firstRange = validRanges[0];
        const startSeconds = firstRange?.startSeconds;
        if (validRanges.length > 0 && firstRange && startSeconds !== null && startSeconds !== undefined) {
          player.currentTime(startSeconds);
          player.play().catch(err => console.error('Failed to play first segment:', err));
        }
      };

      // Handle segment ending and jumping to next segment
      const timeUpdateHandler = () => {
        const currentTime = player!.currentTime() || 0;
        
        // Check all segments to see if we need to pause at the end of the current segment
        if (singleSegmentMode && activeSegmentIndex >= 0) {
          const activeRange = validRanges[activeSegmentIndex];
          if (activeRange?.endSeconds && currentTime >= activeRange.endSeconds) {
            // We've reached the end of the active segment in single segment mode
            // Pause and position exactly at the end time
            player!.pause();
            player!.currentTime(activeRange.endSeconds);
            return;
          }
        }
        
        // If we're between segments or before first segment, find where we should be
        let targetSegmentIndex = -1;
        
        // Check if we're in any segment
        for (let i = 0; i < validRanges.length; i++) {
          const range = validRanges[i];
          if (range.startSeconds !== null && range.endSeconds !== null) {
            if (currentTime >= range.startSeconds && currentTime < range.endSeconds) {
              // We're in this segment
              currentSegmentIndex = i;
              targetSegmentIndex = i;
              break;
            }
          }
        }
        
        // If we've passed the end of a segment, jump to the next one or pause based on mode
        if (targetSegmentIndex === -1) {
          // We're not in any segment. Check if we've just passed a segment end
          for (let i = 0; i < validRanges.length; i++) {
            const range = validRanges[i];
            // Add 0.5 seconds buffer to the end time before jumping
            const bufferedEndTime = range.endSeconds !== null ? range.endSeconds + 0.5 : null;
            if (bufferedEndTime !== null && currentTime >= bufferedEndTime) {
              // We've passed this segment (with buffer)
              if (i === currentSegmentIndex) {
                // In auto-play mode, jump to the next segment
                if (!singleSegmentMode && i < validRanges.length - 1) {
                  // We just finished the current segment, jump to next one
                  const nextRange = validRanges[i + 1];
                  if (nextRange && nextRange.startSeconds !== null) {
                    player!.currentTime(nextRange.startSeconds);
                    currentSegmentIndex = i + 1;
                    return;
                  }
                }
              }
            }
          }
          
          // If we're before the first segment, jump to it
          if (validRanges.length > 0 && validRanges[0].startSeconds !== null && currentTime < validRanges[0].startSeconds) {
            initializeSegment();
            return;
          }
          
          // If we're after the last segment, pause
          const lastSegment = validRanges[validRanges.length - 1];
          const bufferedLastEndTime = lastSegment.endSeconds !== null ? lastSegment.endSeconds + 0.5 : null;
          if (bufferedLastEndTime !== null && currentTime > bufferedLastEndTime) {
            player.pause();
            return;
          }
        }
      };

      // Stop the video from playing outside segments
      const seekedHandler = () => {
        const currentTime = player.currentTime() || 0;
        
        // Check if we're in any valid segment
        let inSegment = false;
        for (const range of validRanges) {
          if (range.startSeconds !== null && range.endSeconds !== null) {
            if (currentTime >= range.startSeconds && currentTime < range.endSeconds) {
              inSegment = true;
              break;
            }
          }
        }
        
        // If user manually seeks outside all segments
        if (!inSegment) {
          // If before first segment, jump to first segment
          if (currentTime < (validRanges[0]?.startSeconds || 0)) {
            initializeSegment();
          } 
          // If after last segment, stay paused
          else if (currentTime > (validRanges[validRanges.length - 1]?.endSeconds || 0)) {
            player.pause();
          }
          // If between segments, jump to next segment
          else {
            // Find the next segment
            for (let i = 0; i < validRanges.length; i++) {
              const range = validRanges[i];
              if (range.startSeconds !== null && currentTime < range.startSeconds) {
                player.currentTime(range.startSeconds);
                currentSegmentIndex = i;
                break;
              }
            }
          }
        }
      };

      // Add end-of-video handler to prevent auto-replay
      const endedHandler = () => {
        // Prevent the player from automatically restarting
        player.pause();
        // Move to the end of the last segment to prevent restart
        if (validRanges.length > 0 && validRanges[validRanges.length - 1].endSeconds) {
          player.currentTime(validRanges[validRanges.length - 1].endSeconds - 0.1);
        }
      };

      // Initialize to first segment 
      initializeSegment();
      
      // Register handlers
      player.on('timeupdate', timeUpdateHandler);
      player.on('seeked', seekedHandler);
      player.on('ended', endedHandler);
      
      // Clean up the event handlers when component unmounts or values change
      return () => {
        player.off('timeupdate', timeUpdateHandler);
        player.off('seeked', seekedHandler);
        player.off('ended', endedHandler);
      };
    }
  }, [player, timestampRanges, singleSegmentMode, activeSegmentIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleLoadVideo();
      }
    },
    [handleLoadVideo]
  );

  const addTimestampRange = () => {
    const newRanges = [...timestampRanges, { start: '', end: '', startSeconds: null, endSeconds: null, label: '' }];
    handleTimestampRangesChange(newRanges);
  };

  const updateTimestampRange = (index: number, field: 'start' | 'end', value: string) => {
    const updatedRanges = [...timestampRanges];
    updatedRanges[index][field] = value;
    handleTimestampRangesChange(updatedRanges);
  };

  const jumpToTimestamp = (index: number) => {
    if (!player) return;
    
    const range = timestampRanges[index];
    if (range.startSeconds !== null) {
      // Enable single segment mode and set active segment
      handleSingleSegmentModeChange(true);
      handleActiveSegmentChange(index);
      
      player.currentTime(range.startSeconds);
      player.play().catch(err => console.error('Failed to play after clicking timestamp:', err));
    }
  };

  const videoJsOptions = {
    autoplay: false,
    controls: true,
    responsive: true,
    fluid: true,
    sources: getVideoSource(),
  };

  const handlePlayerReady = useCallback((videoPlayer: Player) => {
    // Store the player instance to use in effects
    setPlayer(videoPlayer);
  }, []);

  const onCut = async (starting_s: string, ending_s: string) => {
    console.log(starting_s, ending_s);
  }
  useKeyboardShortcuts({
    onCut,
  });
  useTimelineDataInitializer({
    videoSrc: currentVideoUrl,
  });

  const setVideoSrc = useTimelineDataStore((state) => state.setVideoSrc);
  
  // useEffect to set the video source
  useEffect(() => {
    if (currentVideoUrl) {
      if (isYoutubeUrl(currentVideoUrl)) {
        const youtubeId = getYoutubeId(currentVideoUrl);
        if (youtubeId) {
          // Format the YouTube URL properly for the timeline
          const youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeId}`;
          setVideoSrc(youtubeEmbedUrl);
        } else {
          setVideoSrc(currentVideoUrl);
        }
      } else {
        // For direct video URLs
        setVideoSrc(currentVideoUrl);
      }
    }
    return () => setVideoSrc('');
  }, [currentVideoUrl, setVideoSrc]);
  
  return (
    <>
    <Card className="w-full max-w-full mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Video Player</CardTitle>
      </CardHeader>
      <CardContent>
        {currentVideoUrl ? (
          <>
          <VideoPlayer
            options={videoJsOptions}
            onReady={handlePlayerReady}
            timestampRanges={timestampRanges}
          />
          <SalinaPlayer />
          </>
        ) : (
          <div className="w-full aspect-video bg-slate-800 flex items-center justify-center text-white">
            Enter a video URL to start playing
          </div>
        )}
        <div className="mt-4 space-y-3">
          <div className="flex space-x-2">
            <Input
              type="text"
              placeholder="Enter video URL (direct link or YouTube)"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button onClick={handleLoadVideo}>Load Video</Button>
          </div>
          
          {/* Playback mode toggle */}
          {currentVideoUrl && (
            <div className="flex items-center justify-between mb-2 pb-2 border-b">
              <span className="text-sm font-medium">Playback Mode:</span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleSingleSegmentModeChange(!singleSegmentMode)}
                className="ml-2"
              >
                {singleSegmentMode ? "Single Segment Mode" : "Auto-play All Segments"}
              </Button>
            </div>
          )}
          
          <div className="space-y-3">
            <h3 className="font-medium text-sm mb-2">Define Timestamp Segments:</h3>
            {timestampRanges.map((range, index) => (
              <div key={index} className="flex space-x-2 items-center p-2 border rounded-md">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-none font-medium px-2 py-1 h-auto min-w-[40px] hover:bg-gray-100"
                  onClick={() => jumpToTimestamp(index)}
                  disabled={!range.start || !range.startSeconds}
                >
                  Segment {index + 1}
                </Button>
            <Input
              type="text"
                  placeholder="Start time (HH:MM:SS, MM:SS, or SS)"
                  value={range.start}
                  onChange={(e) => updateTimestampRange(index, 'start', e.target.value)}
              className="flex-1"
            />
            <Input
              type="text"
                  placeholder="End time (HH:MM:SS, MM:SS, or SS)"
                  value={range.end}
                  onChange={(e) => updateTimestampRange(index, 'end', e.target.value)}
              className="flex-1"
            />
              </div>
            ))}
            <Button onClick={addTimestampRange} className="w-full">Add Timestamp Range</Button>
          </div>
        </div>
        
        {/* Timeline component */}
        <div className="mt-6 w-full overflow-hidden">
          <Timeline userToken="kRP1FSVEA8D9GqX43nTBeWwsdqIvNZ6KaLzgj0lMmoJiYcayCeuabdhtxpUH7QOf" startOffset />
        </div>
      </CardContent>
      <CardFooter className="text-sm text-gray-500">
        Supports direct video links and YouTube URLs with multiple timestamp ranges
      </CardFooter>
    </Card>
    </>
  );
};

export default VideoPlayerContainer;
