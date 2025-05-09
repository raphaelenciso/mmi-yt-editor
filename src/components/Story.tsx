/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AlertDialog,
  Player,
  SonnerToaster,
  Timeline,
  Toaster,
  useKeyboardShortcuts,
  useRefresh,
  useTimelineDataInitializer,
  useTrimmedService,
  useTrimmerStampStore,
} from '@salina-app/media-editor';

const StorybookStory = ({
  audioSrc,
  thumbnails,
  mainFilePath,
  userToken,
  videoMetadata,
}: any) => {
  const { preCutClip } = useTrimmedService();
  const { refreshTrimmedClips, refreshTrimmedDirectory } = useRefresh();
  const { resetTrimmerStamp } = useTrimmerStampStore();

  const onCut = async (starting_s: string, ending_s: string) => {
    const timeAired = videoMetadata.videoTitle.split('.');

    const videoTitleAuto = videoMetadata.videoTitle
      ? `clip_${Date.now()}_${timeAired[0]}${starting_s}-${ending_s}`
      : 'default';

    const payload = {
      title: videoTitleAuto,
      type: videoMetadata.videoTitle.includes('mp3') ? 'audio' : 'video',
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
        refreshTrimmedClips(
          {
            source: mainFilePath,
            access_token: userToken,
          },
          resetTrimmerStamp
        );
        refreshTrimmedDirectory({
          path_directory: `${mainFilePath.substring(
            0,
            mainFilePath.lastIndexOf('/')
          )}`,
          access_token: userToken,
        });
      } catch (error: any) {
        console.log(error);
        // toast({
        //   variant: 'destructive',
        //   title: 'Uh oh! Something went wrong.',
        //   description: error.response.data.server_response,
        //   className:
        //     'text-left bg-red-600 focus:outline-none outline-none focus:ring-0 focus:border-transparent',
        //   duration: 2500,
        // });
        resetTrimmerStamp();
      }
    });
  };

  useKeyboardShortcuts({
    onCut,
  });
  // useInitialTrimmedClipsVideoMetadata(userToken, mainFilePath, videoMetadata);
  useTimelineDataInitializer({
    videoSrc: videoMetadata.videoLink,
  });

  return (
    <div className="h-screen w-screen flex flex-col">
      <Player className="h-[50vh]  mx-auto" />

      <div className="absolute bottom-0">
        <Timeline userToken={userToken} defaultZoomSize={85} />
      </div>

      {/* define global dialog for confimation modal */}
      <AlertDialog />
      <SonnerToaster expand richColors closeButton />
      <Toaster />
    </div>
  );
};

export default StorybookStory;
