import React, { useEffect } from 'react';
import '@/App.css';
import RaceAnalyzer from './components/RaceAnalyzer';
import { fetchKMTidRaceData } from './services/fetchKMTidRaceData';

function App() {
  useEffect(() => {
    const runKMTidTest = async () => {
      const data = await fetchKMTidRaceData('260307');

      console.log('[KMTid test] returned data:', data);
      console.log('[KMTid test] is null:', data === null);

      if (data && typeof data === 'object') {
        console.log('[KMTid test] top-level keys:', Object.keys(data));
      } else {
        console.log('[KMTid test] top-level keys: none');
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
