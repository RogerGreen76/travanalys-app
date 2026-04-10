import React, { useEffect } from 'react';
import '@/App.css';
import RaceAnalyzer from './components/RaceAnalyzer';
import { fetchKMTidRaceData } from './services/fetchKMTidRaceData';

function App() {
  useEffect(() => {
    const runKMTidTest = async () => {
      const data = await fetchKMTidRaceData('260307');

      console.log('[KMTid test] is null:', data === null);
      if (typeof data === 'string') {
        console.log('[KMTid test] length:', data.length);
        console.log('[KMTid test] first 500 chars:', data.slice(0, 500));
      } else {
        console.log('[KMTid test] length: n/a');
        console.log('[KMTid test] first 500 chars: n/a');
      }
    };

    runKMTidTest();
  }, []);

  return (
    <div className="App dark min-h-screen bg-[#0a0e1a]">
      <RaceAnalyzer />
    </div>
  );
}

export default App;
