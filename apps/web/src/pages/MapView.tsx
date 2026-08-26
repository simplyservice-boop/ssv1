import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Map, Layers, Building2, X, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import api from '../lib/api';
import { formatCurrency, toArray } from '../lib/utils';

declare global { interface Window { mapboxgl: any; } }

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

interface Property {
  id: string; name: string; address: string; city: string; state: string;
  type: string; status: string; units: number;
  latitude?: number; longitude?: number;
  _count?: { units_rel?: number; workOrders?: number };
}

function PropertyPanel({ property, onClose }: { property: Property; onClose: () => void }) {
  const navigate = useNavigate();
  const statusColor: Record<string,string> = { ACTIVE:'success', INACTIVE:'danger', MAINTENANCE:'warning', PENDING:'default' };
  return (
    <div className="absolute top-4 right-4 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 z-10 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Building2 className="w-4 h-4" />
          <span className="font-semibold text-sm truncate">{property.name}</span>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant={statusColor[property.status]||'default'} size="sm">{property.status}</Badge>
          <Badge variant="default" size="sm">{property.type?.replace(/_/g,' ')}</Badge>
        </div>
        <p className="text-sm text-gray-600">{property.address}, {property.city}, {property.state}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{property._count?.units_rel ?? property.units ?? 0}</p>
            <p className="text-xs text-gray-500">Units</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{property._count?.workOrders||0}</p>
            <p className="text-xs text-gray-500">Work Orders</p>
          </div>
        </div>
        <Button className="w-full" icon={<ChevronRight className="w-4 h-4" />} onClick={()=>navigate(`/properties/${property.id}`)}>View Property</Button>
      </div>
    </div>
  );
}

export default function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [selected, setSelected] = useState<Property|null>(null);
  const [satellite, setSatellite] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const { data } = useQuery({ queryKey:['properties-map'], queryFn: () => api.get('/properties', { params: { limit: 100 } }).then(r=>r.data) });
  const properties: Property[] = toArray<Property>(data?.data?.properties ?? data?.properties);
  const mappedProperties = properties.filter((property) => property.latitude != null && property.longitude != null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    if (!MAPBOX_TOKEN) { setMapReady(false); return; }

    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js';
    script.onload = () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css';
      document.head.appendChild(link);

      setTimeout(() => {
        if (!mapRef.current || !window.mapboxgl) return;
        window.mapboxgl.accessToken = MAPBOX_TOKEN;
        mapInstance.current = new window.mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-79.9959, 40.4406],
          zoom: 11,
        });
        mapInstance.current.addControl(new window.mapboxgl.NavigationControl(), 'bottom-right');
        setMapReady(true);
      }, 100);
    };
    document.head.appendChild(script);
    return () => { mapInstance.current?.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapInstance.current || mappedProperties.length === 0) return;
    const map = mapInstance.current;
    const markers: any[] = [];
    mappedProperties.forEach((p) => {
      const lat = p.latitude as number;
      const lng = p.longitude as number;
      const el = document.createElement('div');
      el.className = 'cursor-pointer';
      el.innerHTML = `<div style="background:#4f46e5;color:white;padding:6px 10px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid white;">${p.name.length > 20 ? p.name.substring(0,18)+'…' : p.name}</div>`;
      el.addEventListener('click', () => setSelected(p));
      const marker = new window.mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      markers.push(marker);
    });
    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [mapReady, mappedProperties]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const style = satellite ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/streets-v12';
    mapInstance.current.setStyle(style);
  }, [satellite, mapReady]);

  return (
    <Layout title="Map View">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Portfolio Map</h1>
            <p className="text-sm text-gray-500 mt-1">{mappedProperties.length} of {properties.length} properties have map coordinates</p>
          </div>
          {MAPBOX_TOKEN && (
            <button onClick={()=>setSatellite(!satellite)} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${satellite ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'}`}>
              <Layers className="w-4 h-4" />{satellite ? 'Street View' : 'Satellite'}
            </button>
          )}
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{height:'calc(100vh - 14rem)'}}>
          {!MAPBOX_TOKEN ? (
            <div className="h-full bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center justify-center p-8">
              <Map className="w-16 h-16 text-indigo-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-700 mb-2">Map Integration Ready</h3>
              <p className="text-gray-500 text-sm text-center mb-6 max-w-md">Add your Mapbox public token to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">VITE_MAPBOX_TOKEN</code> in your <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.env</code> file to enable the interactive portfolio map.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl">
                {properties.map(p=>(
                  <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:border-indigo-300 cursor-pointer transition-all" onClick={()=>setSelected(p)}>
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-2">
                      <Building2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-500 truncate">{p.city}, {p.state}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Badge variant="default" size="sm">{p._count?.units_rel ?? p.units ?? 0} units</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div ref={mapRef} className="w-full h-full" />
          )}
          {selected && <PropertyPanel property={selected} onClose={()=>setSelected(null)} />}
        </div>
      </div>
    </Layout>
  );
}
