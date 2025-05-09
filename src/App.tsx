import '@salina-app/media-editor/dist/index.css';
import VideoPlayerContainer from './components/VideoPlayerContainer';

function App() {
  const args = {
    isInChapter: true,
    timestampLines: true,
    defaultZoomSize: 25,
  };

  // Story-specific data that's not part of Timeline props
  const storyProps = {
    audioSrc:
      'https://vmzfzp2ff5.ufs.sh/f/pPSFVJQtMwHIQrb4rADCfDZBAsxJ1w9nUIPXyNtazWLKkp5i',
    thumbnails: [
      'https://vmzfzp2ff5.ufs.sh/f/pPSFVJQtMwHI2Lk3b30YqN3AG8xTSXev7JZpuakcr1HBFnif',
      'https://vmzfzp2ff5.ufs.sh/f/pPSFVJQtMwHIqbfRzGF2nwlIbfmAKGUYuBNpePdvazJES71t',
      'https://vmzfzp2ff5.ufs.sh/f/pPSFVJQtMwHIz6UhqonSZrPM8QL12jU3xmKANIt76cduEY0h',
      'https://vmzfzp2ff5.ufs.sh/f/pPSFVJQtMwHIOPMxY94UNeGTYEJ4D2scdWLruSxVfiOQzmHC',
    ],
    mainFilePath: '/video-recordings/GMANEWSTV/2025/04/03/0_2_00_.mp4',
    pathname: '/video',
    userToken:
      'kEs0AtaiKxzdehNJS3oUrVBpTBMP5jReuQFWn2ZvmfGcL4HDdaIOCl7gwXq68b9y',
    videoMetadata: {
      videoTitle: '0_2_00_.mp4',
      videoLink:
        'https://putulero-salina-api-staging.media-meter.in/stream/video?file=/video-recordings/GMANEWSTV/2025/04/03/0_2_00_.mp4',
      trimmed: false,
      fileType: 'raw',
    },
  };

  return <VideoPlayerContainer {...args} {...storyProps} />;
}

export default App;
