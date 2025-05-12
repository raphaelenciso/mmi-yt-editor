/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import type Player from 'video.js/dist/types/player';
import {
  AlertDialog,
  Player as SalinaPlayer,
  SonnerToaster,
  Timeline,
  Toaster,
  useKeyboardShortcuts,
  useRefresh,
  useTimelineDataInitializer,
  useTrimmedService,
  useTrimmerStampStore,
  useTimelineDataStore,
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

const VideoPlayerContainer = ({
  userToken,
  videoMetadata,
}: any) => {
  const { preCutClip } = useTrimmedService();
  const { refreshTrimmedClips, refreshTrimmedDirectory } = useRefresh();
  const { resetTrimmerStamp } = useTrimmerStampStore();
  const setVideoSrc = useTimelineDataStore((state) => state.setVideoSrc);

  const [videoUrl, setVideoUrl] = useState(videoMetadata?.videoLink || '');
  const [currentVideoUrl, setCurrentVideoUrl] = useState(videoMetadata?.videoLink || '');
  const [salinaVideoUrl, setSalinaVideoUrl] = useState('');
  const [salinaKey, setSalinaKey] = useState(0); // Add key for forcing remount
  const [timestampRanges, setTimestampRanges] = useState<TimestampRange[]>([{ start: '', end: '', startSeconds: null, endSeconds: null, label: '' }]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [singleSegmentMode, setSingleSegmentMode] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);

  const handleSingleSegmentModeChange = useCallback((newMode: boolean) => {
    setSingleSegmentMode(newMode);
  }, []);

  const handleActiveSegmentChange = useCallback((index: number) => {
    setActiveSegmentIndex(index);
  }, []);

  const handleTimestampRangesChange = useCallback((ranges: TimestampRange[]) => {
    setTimestampRanges(ranges);
  }, []);

  const handleLoadVideo = useCallback(() => {
    if (videoUrl) {
      // Convert existing ranges' times to seconds
      const updatedRanges = timestampRanges.map((range, index) => {
        const startSec = timeToSeconds(range.start);
        const endSec = timeToSeconds(range.end);
        
        // Only include ranges where both start and end are valid
        if (startSec !== null && endSec !== null && startSec < endSec) {
          return { 
            ...range, 
            startSeconds: startSec, 
            endSeconds: endSec,
            label: `Segment ${index + 1}`
          };
        }
        
        // Keep the range but mark it as invalid (will be filtered out later)
        return { ...range, startSeconds: startSec, endSeconds: endSec };
      });
      
      // Filter out completely empty ranges to avoid clutter
      const filteredRanges = updatedRanges.filter(range => 
        range.start.trim() !== '' || range.end.trim() !== ''
      );
      
      // Ensure we always have at least one range for the user to edit
      if (filteredRanges.length === 0) {
        filteredRanges.push({ 
          start: '', 
          end: '', 
          startSeconds: null, 
          endSeconds: null, 
          label: '' 
        });
      }
      
      // Update the timestamp ranges
      handleTimestampRangesChange(filteredRanges);

      // Handle YouTube URLs for both players
      if (isYoutubeUrl(videoUrl)) {
        console.log('Detected YouTube URL:', videoUrl);
        const youtubeId = getYoutubeId(videoUrl);
        if (youtubeId) {
          // Format YouTube URL for SalinaPlayer
          const youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeId}`;
          console.log('Setting SalinaPlayer embed URL:', youtubeEmbedUrl);
          setVideoSrc(youtubeEmbedUrl);
          setSalinaKey(prev => prev + 1);
        }
      } else {
        // For direct video URLs
        console.log('Setting direct video URL:', videoUrl);
        setVideoSrc(videoUrl);
        setSalinaKey(prev => prev + 1);
      }

      // Set the current video URL last to trigger VideoJS player update
      setCurrentVideoUrl(videoUrl);
    }
  }, [videoUrl, timestampRanges, handleTimestampRangesChange, setVideoSrc]);

  const getVideoSource = useCallback(() => {
    if (!currentVideoUrl) return [];

    if (isYoutubeUrl(currentVideoUrl)) {
      const youtubeId = getYoutubeId(currentVideoUrl);
      if (youtubeId) {
        return [
          {
            src: `https://www.youtube.com/watch?v=${youtubeId}`,
            type: 'video/youtube',
          },
        ];
      }
    }

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

  useEffect(() => {
    if (!player) return;

    if (timestampRanges.length > 0) {
      const validRanges = timestampRanges.filter(range => 
        range.startSeconds !== null && 
        range.endSeconds !== null &&
        range.start.trim() !== '' &&
        range.end.trim() !== ''
      );
      
      if (validRanges.length === 0) return;

      validRanges.sort((a, b) => (a.startSeconds || 0) - (b.startSeconds || 0));

      let currentSegmentIndex = 0;

      const initializeSegment = () => {
        const firstRange = validRanges[0];
        const startSeconds = firstRange?.startSeconds;
        if (validRanges.length > 0 && firstRange && startSeconds !== null && startSeconds !== undefined) {
          player?.currentTime(startSeconds);
        }
      };

      const timeUpdateHandler = () => {
        const currentTime = player?.currentTime() || 0;
        
        // Handle single segment mode with higher priority
        if (singleSegmentMode && activeSegmentIndex >= 0) {
          // Find the active range
          const activeRangeIndex = Math.min(activeSegmentIndex, validRanges.length - 1);
          const activeRange = validRanges[activeRangeIndex];
          
          // If we have a valid range with an end time and we've reached that time
          if (activeRange?.endSeconds && currentTime >= activeRange.endSeconds) {
            console.log(`Reached end of segment ${activeRangeIndex + 1}, pausing at ${activeRange.endSeconds}`);
            
            // Pause the video
            player?.pause();
            
            // Make sure we're at the correct end position
            setTimeout(() => {
              if (player && typeof player.currentTime === 'function' && activeRange.endSeconds !== null) {
                player.currentTime(activeRange.endSeconds - 0.1);
              }
            }, 10);
            
            return;
          }
        }
        
        // The rest of the handler for non-single segment mode
        let targetSegmentIndex = -1;
        
        for (let i = 0; i < validRanges.length; i++) {
          const range = validRanges[i];
          if (range.startSeconds !== null && range.endSeconds !== null) {
            if (currentTime >= range.startSeconds && currentTime < range.endSeconds) {
              currentSegmentIndex = i;
              targetSegmentIndex = i;
              break;
            }
          }
        }
        
        if (targetSegmentIndex === -1) {
          for (let i = 0; i < validRanges.length; i++) {
            const range = validRanges[i];
            const bufferedEndTime = range.endSeconds !== null ? range.endSeconds + 0.5 : null;
            if (bufferedEndTime !== null && currentTime >= bufferedEndTime) {
              if (i === currentSegmentIndex) {
                // Only handle this for non-single segment mode
                if (!singleSegmentMode && i < validRanges.length - 1) {
                  const nextRange = validRanges[i + 1];
                  if (nextRange && nextRange.startSeconds !== null) {
                    player?.currentTime(nextRange.startSeconds);
                    currentSegmentIndex = i + 1;
                    return;
                  }
                } else {
                  // Pause at the end of segment
                  player?.pause();
                  return;
                }
              }
            }
          }
          
          // Only initialize to segment 1 if not in single segment mode
          // and the current time is before the first segment
          if (!singleSegmentMode && validRanges.length > 0 && 
              validRanges[0].startSeconds !== null && 
              currentTime < validRanges[0].startSeconds) {
            initializeSegment();
            return;
          }
          
          const lastSegment = validRanges[validRanges.length - 1];
          const bufferedLastEndTime = lastSegment.endSeconds !== null ? lastSegment.endSeconds + 0.5 : null;
          if (bufferedLastEndTime !== null && currentTime > bufferedLastEndTime) {
            player.pause();
            return;
          }
        }
      };

      const seekedHandler = () => {
        // Only run the auto-adjust if we're not in single segment mode or actively selecting a segment
        if (singleSegmentMode) {
          return; // Skip this handler completely in single segment mode
        }
        
        const currentTime = player.currentTime() || 0;
        
        let inSegment = false;
        for (const range of validRanges) {
          if (range.startSeconds !== null && range.endSeconds !== null) {
            if (currentTime >= range.startSeconds && currentTime < range.endSeconds) {
              inSegment = true;
              break;
            }
          }
        }
        
        if (!inSegment) {
          if (currentTime < (validRanges[0]?.startSeconds || 0)) {
            initializeSegment();
          } 
          else if (currentTime > (validRanges[validRanges.length - 1]?.endSeconds || 0)) {
            player.pause();
          }
          else {
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

      const endedHandler = () => {
        player?.pause();
        if (validRanges.length > 0 && validRanges[validRanges.length - 1].endSeconds !== null) {
          player?.currentTime(validRanges[validRanges.length - 1].endSeconds - 0.1);
        }
      };

      // Remove automatic initialization to first segment on mount
      // initializeSegment();
      
      player.on('timeupdate', timeUpdateHandler);
      player.on('seeked', seekedHandler);
      player.on('ended', endedHandler);
      
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
    
    // Update the corresponding seconds value
    if (field === 'start') {
      updatedRanges[index].startSeconds = timeToSeconds(value);
    } else if (field === 'end') {
      updatedRanges[index].endSeconds = timeToSeconds(value);
    }
    
    // If this is a valid range, ensure we update the label
    if (updatedRanges[index].startSeconds !== null && updatedRanges[index].endSeconds !== null) {
      updatedRanges[index].label = `Segment ${index + 1}`;
    }
    
    console.log(`Updated range ${index}, field ${field} to:`, updatedRanges[index]);
    handleTimestampRangesChange(updatedRanges);
  };

  const jumpToTimestamp = (index: number) => {
    if (!player) {
      console.error('Player not initialized');
      return;
    }
    
    console.log(`Jumping to timestamp index ${index}`);
    
    const range = timestampRanges[index];
    if (!range || range.startSeconds === null) {
      console.error('Invalid range or start time:', range);
      return;
    }

    console.log(`Setting time to ${range.startSeconds} seconds`);
    
    // First pause the video
    player.pause();
    
    // Then set the time
    player.currentTime(range.startSeconds);
    
    // Switch to single segment mode and set active segment
    handleSingleSegmentModeChange(true);
    handleActiveSegmentChange(index);
    
    // Small delay to ensure the time is set
    setTimeout(() => {
      if (player && typeof player.currentTime === 'function') {
        const currentTime = player.currentTime() || 0;
        if (Math.abs(currentTime - range.startSeconds!) > 0.5) {
          console.log(`Correcting position from ${currentTime} to ${range.startSeconds}`);
          player.currentTime(range.startSeconds!);
        }
      }
    }, 100);
  };

  const handlePlayerReady = useCallback((videoPlayer: Player) => {
    setPlayer(videoPlayer);
  }, []);

  const onCut = async (starting_s: string, ending_s: string) => {
    // Log the incoming values
    console.log('Cut timestamps received:', { starting_s, ending_s });
    
    // Parse timestamps in format "00:00:02" to seconds
    const parseTimeToSeconds = (timeStr: string): number => {
      // Remove quotes if present
      timeStr = timeStr.replace(/"/g, '');
      const parts = timeStr.split(':');
      let seconds = 0;
      
      if (parts.length === 3) { // HH:MM:SS
        seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
      } else if (parts.length === 2) { // MM:SS
        seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
      } else { // SS
        seconds = parseFloat(parts[0]);
      }
      
      return seconds;
    };

    const startTime = parseTimeToSeconds(starting_s);
    const endTime = parseTimeToSeconds(ending_s);
    
    console.log('Parsed to seconds:', { startTime, endTime });
    
    if (isNaN(startTime) || isNaN(endTime)) {
      console.error('Invalid timestamp values:', { starting_s, ending_s });
      return;
    }

    // Format seconds back to time string
    const formatTimeString = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const wholeSeconds = Math.floor(seconds % 60);
      const milliseconds = Math.floor((seconds % 1) * 100); // Get 2 decimal places
      
      // Format with two decimal places using colon
      const secondsPart = `${wholeSeconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`;
      
      if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secondsPart}`;
      }
      return `${minutes.toString().padStart(2, '0')}:${secondsPart}`;
    };

    // Find the first empty segment or create a new one
    const updatedRanges = [...timestampRanges];
    const emptySegmentIndex = updatedRanges.findIndex(range => 
      (!range.start || range.start === '') && (!range.end || range.end === '')
    );

    const newSegment: TimestampRange = {
      start: formatTimeString(startTime),
      end: formatTimeString(endTime),
      startSeconds: startTime,
      endSeconds: endTime,
      label: `Segment ${emptySegmentIndex >= 0 ? emptySegmentIndex + 1 : updatedRanges.length + 1}`
    };

    if (emptySegmentIndex >= 0) {
      console.log(`Updating empty segment at index ${emptySegmentIndex}:`, newSegment);
      updatedRanges[emptySegmentIndex] = newSegment;
    } else {
      console.log('Adding new segment:', newSegment);
      updatedRanges.push(newSegment);
    }

    handleTimestampRangesChange(updatedRanges);
    resetTrimmerStamp();
  };

  useKeyboardShortcuts({
    onCut,
    disablePlayPause: true,
  });

  useTimelineDataInitializer({
    videoSrc: currentVideoUrl || videoMetadata.videoLink,
  });

  // Cleanup effect to reset video source when unmounting
  useEffect(() => {
    return () => {
      setVideoSrc('');
      resetTrimmerStamp();
    };
  }, [setVideoSrc, resetTrimmerStamp]);

  // Add a useEffect to debug the timestampRanges
  useEffect(() => {
    // Log the current timestamp ranges whenever they change
    console.log('Current timestampRanges:', timestampRanges);
    
    // Check for valid ranges that should be highlighted
    const validRanges = timestampRanges.filter(range => 
      range.startSeconds !== null && 
      range.endSeconds !== null
    );
    console.log('Valid ranges for highlighting:', validRanges);
  }, [timestampRanges]);

  // Add a useEffect to disable autoplay for SalinaPlayer that's placed after other effects
  useEffect(() => {
    // Function to find and disable autoplay on any video elements
    const disableAutoplay = () => {
      try {
        // Give time for SalinaPlayer to initialize
        setTimeout(() => {
          // Find any video elements in the document that might be from SalinaPlayer
          const videoElements = document.querySelectorAll('video');
          // console.log('Found video elements:', videoElements.length);
          
          videoElements.forEach(video => {
            // Set autoplay to false
            video.autoplay = false;
            
            // Force pause if it's already playing
            if (!video.paused) {
              video.pause();
            }
            
            // console.log('Disabled autoplay on video element');
          });
        }, 500);
      } catch (error) {
        console.error('Error disabling autoplay:', error);
      }
    };
    
    // Run the function when component mounts
    disableAutoplay();
    
  }, []); // Empty dependency array to run only once on mount

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      {/* Hidden SalinaPlayer - maintains cutting functionality */}
      <div className="hidden overflow-hidden h-0 w-0 opacity-0 absolute pointer-events-none">
        <SalinaPlayer 
          className="h-[50vh] w-full" 
          key={`salina-player-${salinaKey}`}
        />
      </div>

      {/* Main content area with scrolling */}
      <div className="flex-1 overflow-y-auto pb-32 px-4 md:px-8 max-w-6xl mx-auto w-full"> 
        {/* Video player section */}
        <div className="py-6">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Video Player</h2>
            <div className="rounded-lg overflow-hidden shadow-lg w-full max-w-4xl mx-auto">
              <VideoPlayer
                options={{
                  autoplay: false,
                  controls: true,
                  responsive: true,
                  fluid: true,
                  sources: getVideoSource(),
                }}
                onReady={handlePlayerReady}
                timestampRanges={timestampRanges.filter(range => 
                  range.startSeconds !== null && 
                  range.endSeconds !== null
                )}
              />
            </div>
          </div>
        </div>

        {/* Controls section */}
        <div className="w-full mb-8 bg-white rounded-lg shadow-md p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Video URL</label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Enter video URL (direct link or YouTube)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <button 
                onClick={handleLoadVideo} 
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors shadow-sm"
              >
                Load Video
              </button>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              Current source: {useTimelineDataStore.getState().videoSrc || 'None'}
            </div>
          </div>

          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
            <h3 className="font-medium text-gray-700">Playback Mode</h3>
            <button 
              onClick={() => handleSingleSegmentModeChange(!singleSegmentMode)}
              className={`ml-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                singleSegmentMode 
                  ? "bg-blue-100 text-blue-800 hover:bg-blue-200" 
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              {singleSegmentMode ? "Single Segment Mode" : "Auto-play All Segments"}
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-700">Define Timestamp Segments</h3>
              <button 
                onClick={addTimestampRange} 
                className="flex items-center text-sm px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Segment
              </button>
            </div>
            
            <div className="space-y-3 mt-2">
              {timestampRanges.map((range, index) => (
                <div 
                  key={index} 
                  className={`flex space-x-2 items-center p-3 border rounded-md transition-all ${
                    activeSegmentIndex === index && singleSegmentMode
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <button
                    className={`flex-none font-medium px-3 py-2 rounded-md transition-colors ${
                      activeSegmentIndex === index && singleSegmentMode
                        ? "bg-blue-500 text-white hover:bg-blue-600"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                    }`}
                    onClick={() => jumpToTimestamp(index)}
                    disabled={!range.start || !range.startSeconds}
                  >
                    {range.start && range.end
                      ? `Segment ${index + 1}`
                      : `Segment ${index + 1}`
                    }
                  </button>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                      <input
                        type="text"
                        placeholder="HH:MM:SS"
                        value={range.start}
                        onChange={(e) => updateTimestampRange(index, 'start', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End Time</label>
                      <input
                        type="text"
                        placeholder="HH:MM:SS"
                        value={range.end}
                        onChange={(e) => updateTimestampRange(index, 'end', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline section - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-md z-50">
        <Timeline userToken={userToken} defaultZoomSize={85} />
      </div>

      <AlertDialog />
      <SonnerToaster expand richColors closeButton />
      <Toaster />
    </div>
  );
};

export default VideoPlayerContainer;
