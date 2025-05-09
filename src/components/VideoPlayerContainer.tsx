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
  audioSrc,
  thumbnails,
  mainFilePath,
  userToken,
  videoMetadata,
}: any) => {
  const { preCutClip } = useTrimmedService();
  const { refreshTrimmedClips, refreshTrimmedDirectory } = useRefresh();
  const { resetTrimmerStamp } = useTrimmerStampStore();

  const [videoUrl, setVideoUrl] = useState('');
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [timestampRanges, setTimestampRanges] = useState<TimestampRange[]>([
    { start: '', end: '', startSeconds: null, endSeconds: null, label: '' }
  ]);
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
      // Make sure all ranges are properly converted to seconds when loading the video
      const updatedRanges = timestampRanges.map(range => {
        const startSec = timeToSeconds(range.start);
        const endSec = timeToSeconds(range.end);
        return { ...range, startSeconds: startSec, endSeconds: endSec };
      });
      handleTimestampRangesChange(updatedRanges);
      setCurrentVideoUrl(videoUrl);
      setVideoLoaded(true);
    }
  }, [videoUrl, timestampRanges, handleTimestampRangesChange]);

  const getVideoSource = useCallback(() => {
    if (!currentVideoUrl || !videoLoaded) return [];

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
  }, [currentVideoUrl, videoLoaded]);

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
          player?.play().catch(err => console.error('Failed to play first segment:', err));
        }
      };

      const timeUpdateHandler = () => {
        const currentTime = player?.currentTime() || 0;
        
        if (singleSegmentMode && activeSegmentIndex >= 0) {
          const activeRange = validRanges[activeSegmentIndex];
          if (activeRange?.endSeconds && currentTime >= activeRange.endSeconds) {
            player?.pause();
            player?.currentTime(activeRange.endSeconds);
            return;
          }
        }
        
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
                if (!singleSegmentMode && i < validRanges.length - 1) {
                  const nextRange = validRanges[i + 1];
                  if (nextRange && nextRange.startSeconds !== null) {
                    player?.currentTime(nextRange.startSeconds);
                    currentSegmentIndex = i + 1;
                    return;
                  }
                }
              }
            }
          }
          
          if (validRanges.length > 0 && validRanges[0].startSeconds !== null && currentTime < validRanges[0].startSeconds) {
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

      initializeSegment();
      
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
    
    // Calculate seconds immediately to make sure highlights update
    if (field === 'start') {
      updatedRanges[index].startSeconds = timeToSeconds(value);
    } else if (field === 'end') {
      updatedRanges[index].endSeconds = timeToSeconds(value);
    }
    
    handleTimestampRangesChange(updatedRanges);
  };

  const jumpToTimestamp = (index: number) => {
    if (!player) return;
    
    const range = timestampRanges[index];
    if (range.startSeconds !== null) {
      handleSingleSegmentModeChange(true);
      handleActiveSegmentChange(index);
      
      player?.currentTime(range.startSeconds);
      player?.play().catch(err => console.error('Failed to play after clicking timestamp:', err));
    }
  };

  const handlePlayerReady = useCallback((videoPlayer: Player) => {
    setPlayer(videoPlayer);
    
    // Process all timestamp segments to ensure they're all highlighted
    const updatedRanges = timestampRanges.map(range => {
      const startSec = timeToSeconds(range.start);
      const endSec = timeToSeconds(range.end);
      return { ...range, startSeconds: startSec, endSeconds: endSec };
    });
    
    // Update ranges with calculated seconds values
    if (JSON.stringify(updatedRanges) !== JSON.stringify(timestampRanges)) {
      handleTimestampRangesChange(updatedRanges);
    }
    
    // Setup listeners to refresh highlights when metadata is loaded
    videoPlayer.on('loadedmetadata', () => {
      setTimeout(() => {
        // Re-apply timestamp ranges after a short delay to ensure UI updates
        handleTimestampRangesChange([...updatedRanges]);
      }, 500);
    });
  }, [timestampRanges, handleTimestampRangesChange]);

  const onCut = async (starting_s: string, ending_s: string) => {
    // Create a new timestamp segment from the cut
    const newSegment = {
      start: starting_s,
      end: ending_s,
      startSeconds: parseInt(starting_s, 10),
      endSeconds: parseInt(ending_s, 10),
      label: `Segment ${timestampRanges.length + 1}`
    };
    
    // Add the new segment to the timestamp ranges
    const updatedRanges = [...timestampRanges];
    // Only add non-empty segments
    if (starting_s && ending_s) {
      // If this is the first segment and it's empty, replace it
      if (updatedRanges.length === 1 && 
          !updatedRanges[0].start && 
          !updatedRanges[0].end) {
        updatedRanges[0] = newSegment;
      } else {
        // Otherwise add as a new segment
        updatedRanges.push(newSegment);
      }
      handleTimestampRangesChange(updatedRanges);
    }

    // Original cut functionality
    const timeAired = videoMetadata?.videoTitle?.split('.') || [];

    const videoTitleAuto = videoMetadata?.videoTitle
      ? `clip_${Date.now()}_${timeAired[0]}${starting_s}-${ending_s}`
      : 'default';

    if (preCutClip && mainFilePath && userToken) {
      const payload = {
        title: videoTitleAuto,
        type: videoMetadata?.videoTitle?.includes('mp3') ? 'audio' : 'video',
        channel_name: mainFilePath.split('/')[2],
        sources: [
          {
            source: mainFilePath,
            timestamp_start: starting_s,
            timestamp_end: ending_s,
          },
        ],
        access_token: userToken,
      };

      preCutClip(payload).then(async () => {
        try {
          if (refreshTrimmedClips && resetTrimmerStamp) {
            refreshTrimmedClips(
              {
                source: mainFilePath,
                access_token: userToken,
              },
              resetTrimmerStamp
            );
          }
          if (refreshTrimmedDirectory) {
            refreshTrimmedDirectory({
              path_directory: `${mainFilePath.substring(
                0,
                mainFilePath.lastIndexOf('/')
              )}`,
              access_token: userToken,
            });
          }
        } catch (error: any) {
          console.log(error);
          if (resetTrimmerStamp) {
            resetTrimmerStamp();
          }
        }
      });
    }
  };

  useKeyboardShortcuts({
    onCut,
  });

  useTimelineDataInitializer({
    videoSrc: videoLoaded ? currentVideoUrl : '',
  });

  return (
    <div className="max-h-screen w-full overflow-y-auto flex flex-col">
      <div className="hidden">
        <SalinaPlayer className="h-[50vh] mx-auto" />
      </div>
      <div className="container mx-auto p-4">
        {videoLoaded ? (
          <VideoPlayer
            options={{
              autoplay: false,
              controls: true,
              responsive: true,
              fluid: true,
              sources: getVideoSource(),
            }}
            onReady={handlePlayerReady}
            timestampRanges={timestampRanges}
          />
        ) : (
          <div className="w-full aspect-video bg-slate-800 flex items-center justify-center text-white">
            Enter a video URL and click "Load Video" to start
          </div>
        )}
        
        <div className="mt-4">
          <div className="flex space-x-2 mb-4">
            <input
              type="text"
              placeholder="Enter video URL (direct link or YouTube)"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 p-2 border rounded-md"
            />
            <button onClick={handleLoadVideo} className="p-2 bg-blue-500 text-white rounded-md">Load Video</button>
          </div>
          
          <div className="flex items-center justify-between mb-4 pb-2 border-b">
            <span className="text-sm font-medium">Playback Mode:</span>
            <button 
              onClick={() => handleSingleSegmentModeChange(!singleSegmentMode)}
              className="ml-2 p-1 bg-gray-200 rounded-md text-sm"
            >
              {singleSegmentMode ? "Single Segment Mode" : "Auto-play All Segments"}
            </button>
          </div>
          
          <div className="space-y-3 mb-4">
            <h3 className="font-medium text-sm mb-2">Define Timestamp Segments:</h3>
            {timestampRanges.map((range, index) => (
              <div key={index} className="flex space-x-2 items-center p-2 border rounded-md">
                <button
                  className="flex-none font-medium px-2 py-1 h-auto min-w-[40px] hover:bg-gray-200 rounded-md"
                  onClick={() => jumpToTimestamp(index)}
                  disabled={!range.start || !range.startSeconds}
                >
                  Segment {index + 1}
                </button>
                <input
                  type="text"
                  placeholder="Start time (HH:MM:SS, MM:SS, or SS)"
                  value={range.start}
                  onChange={(e) => updateTimestampRange(index, 'start', e.target.value)}
                  className="flex-1 p-2 border rounded-md"
                />
                <input
                  type="text"
                  placeholder="End time (HH:MM:SS, MM:SS, or SS)"
                  value={range.end}
                  onChange={(e) => updateTimestampRange(index, 'end', e.target.value)}
                  className="flex-1 p-2 border rounded-md"
                />
              </div>
            ))}
            <button onClick={addTimestampRange} className="w-full p-2 bg-blue-500 text-white rounded-md">Add Timestamp Range</button>
          </div>
        </div>
      </div>

      <div className="mt-auto">
        {videoLoaded && <Timeline userToken={userToken} defaultZoomSize={85} />}
      </div>

      {/* define global dialog for confirmation modal */}
      <AlertDialog />
      <SonnerToaster expand richColors closeButton />
      <Toaster />
    </div>
  );
};

export default VideoPlayerContainer;
