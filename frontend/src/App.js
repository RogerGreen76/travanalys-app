import React, { useEffect } from 'react';
import '@/App.css';
import RaceAnalyzer from './components/RaceAnalyzer';
import { fetchKMTidRaceData } from './services/fetchKMTidRaceData';
import { extractKMTidTimingEntries } from './services/parseKMTidToplist';

function App() {
  useEffect(() => {
    const runKMTidTest = async () => {
      const rawText = await fetchKMTidRaceData('260307');
      const parsedEntries = rawText ? extractKMTidTimingEntries(rawText) : [];

      console.log('[KMTid test] raw is null:', rawText === null);
      console.log('[KMTid test] parsed count:', parsedEntries.length);
      console.log('[KMTid test] first entries:', parsedEntries.slice(0, 3));
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
