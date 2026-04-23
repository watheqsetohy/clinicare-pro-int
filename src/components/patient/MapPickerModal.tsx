import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { X, MapPin, Search } from 'lucide-react';
import { cn } from '@/src/lib/utils';

// Fix for default leaflet marker icon in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function LocationMarker({ position, setPosition }: { position: L.LatLng | null, setPosition: (p: L.LatLng) => void }) {
  const map = useMapEvents({
    click(e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

function MapController({ center }: { center: L.LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 15);
    }
  }, [center, map]);
  return null;
}

export function MapPickerModal({ 
  isOpen, 
  onClose, 
  onSelect 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSelect: (coordsUrl: string) => void
}) {
  const [position, setPosition] = useState<L.LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<L.LatLng | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);

  const defaultCenter: [number, number] = [30.0444, 31.2357]; // Default to Cairo

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data);
      setShowResults(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (result: any) => {
    const latlng = new L.LatLng(parseFloat(result.lat), parseFloat(result.lon));
    setPosition(latlng);
    setMapCenter(latlng);
    setShowResults(false);
    setSearchQuery(result.display_name);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl relative zoom-in-95">
         <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white z-10 shrink-0">
           <div>
             <h2 className="font-bold text-slate-800 flex items-center gap-2">
               <MapPin className="w-5 h-5 text-blue-600"/> 
               Pick Patient Location
             </h2>
             <p className="text-xs text-slate-500">Click on the map to drop a pin. This will generate a Google Maps link.</p>
           </div>
           <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
             <X className="w-5 h-5" />
           </button>
         </div>
         
         <div className="flex-1 w-full bg-slate-100 relative">
           <MapContainer 
             center={defaultCenter} 
             zoom={12} 
             style={{ height: '100%', width: '100%' }}
           >
             <TileLayer
               attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
               url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
             />
             <LocationMarker position={position} setPosition={setPosition} />
             <MapController center={mapCenter} />
           </MapContainer>
           
           {/* Overlays */}
           
           {/* Search Bar */}
           <div className="absolute top-4 left-4 z-[400] w-full max-w-md">
             <form onSubmit={handleSearch} className="relative flex shadow-lg rounded-xl overflow-hidden bg-white border border-slate-200">
               <input 
                 type="text" 
                 placeholder="Search by street or area..." 
                 className="flex-1 px-4 py-3 text-sm focus:outline-none"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 onFocus={() => setShowResults(searchResults.length > 0)}
               />
               <button 
                 type="submit" 
                 disabled={isSearching}
                 className="px-4 py-3 bg-slate-50 text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition border-l border-slate-200"
               >
                 <Search className={cn("w-5 h-5", isSearching && "animate-pulse")} />
               </button>
             </form>
             
             {showResults && searchResults.length > 0 && (
               <div className="mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-48 overflow-y-auto">
                 {searchResults.map((res: any, idx: number) => (
                   <button 
                     key={idx}
                     onClick={() => handleSelectResult(res)}
                     className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 hover:text-blue-700 transition"
                   >
                     {res.display_name}
                   </button>
                 ))}
               </div>
             )}
           </div>

           {!position && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] bg-slate-900/80 text-white px-4 py-2 rounded-full font-medium text-sm shadow-lg pointer-events-none animate-pulse">
               Click anywhere to drop location pin
             </div>
           )}
         </div>
         
         <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center z-10 shrink-0">
           <div className="text-sm font-mono text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-inner">
             {position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : 'Lat / Lng: Not selected'}
           </div>
           <div className="flex gap-3">
             <button 
               onClick={onClose}
               className="px-5 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-xl transition"
             >
               Cancel
             </button>
             <button 
               disabled={!position}
               onClick={() => {
                 if (position) {
                   onSelect(`https://www.google.com/maps?q=${position.lat},${position.lng}`);
                   onClose();
                 }
               }}
               className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition shadow-md flex items-center gap-2"
             >
               <MapPin className="w-4 h-4" />
               Confirm & Apply
             </button>
           </div>
         </div>
      </div>
    </div>
  );
}
