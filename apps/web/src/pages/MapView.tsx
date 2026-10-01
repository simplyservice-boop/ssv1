import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Map, Layers, Building2, X, ChevronRight, Plus, PencilLine, MapPinned, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import api from '../lib/api';
import { toArray } from '../lib/utils';

declare global { interface Window { mapboxgl: any; } }

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const ASSET_STORAGE_KEY = 'ss-map-assets-v1';

type AssetType = 'SMART_DEVICE' | 'VEHICLE' | 'HVAC' | 'WATER' | 'ELECTRICAL' | 'SECURITY' | 'PARKING' | 'OTHER';
type AssetStatus = 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE' | 'REPLACEMENT';

interface Property {
  id: string; name: string; address: string; city: string; state: string;
  type: string; status: string; units: number;
  latitude?: number; longitude?: number;
  _count?: { units_rel?: number; workOrders?: number };
}

interface MapAsset {
  id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  latitude: number;
  longitude: number;
  propertyId?: string;
  tenantName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface AssetDraft {
  name: string;
  type: AssetType;
  status: AssetStatus;
  latitude: string;
  longitude: string;
  propertyId: string;
  tenantName: string;
  notes: string;
}

const demoAssets: MapAsset[] = [
  {
    id: 'asset-1',
    name: 'Pool House Camera',
    type: 'SECURITY',
    status: 'ACTIVE',
    latitude: 40.4415,
    longitude: -79.9957,
    propertyId: 'prop-1',
    tenantName: 'Alicia Moore',
    notes: 'Front entrance camera cluster',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'asset-2',
    name: 'HVAC Unit 2',
    type: 'HVAC',
    status: 'MAINTENANCE',
    latitude: 40.4402,
    longitude: -79.9945,
    propertyId: 'prop-2',
    tenantName: 'North Tower',
    notes: 'Needs filter replacement this week',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const defaultDraft = (propertyId = ''): AssetDraft => ({
  name: '',
  type: 'SMART_DEVICE',
  status: 'ACTIVE',
  latitude: '40.4406',
  longitude: '-79.9959',
  propertyId,
  tenantName: '',
  notes: '',
});

function readStoredAssets(): MapAsset[] {
  try {
    const raw = localStorage.getItem(ASSET_STORAGE_KEY);
    if (!raw) return demoAssets;
    const parsed = JSON.parse(raw) as MapAsset[];
    return parsed.length ? parsed : demoAssets;
  } catch {
    return demoAssets;
  }
}

function PropertyPanel({ property, onClose }: { property: Property; onClose: () => void }) {
  const navigate = useNavigate();
  const statusColor: Record<string, string> = { ACTIVE: 'success', INACTIVE: 'danger', MAINTENANCE: 'warning', PENDING: 'default' };
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
          <Badge variant={statusColor[property.status] || 'default'} size="sm">{property.status}</Badge>
          <Badge variant="default" size="sm">{property.type?.replace(/_/g, ' ')}</Badge>
        </div>
        <p className="text-sm text-gray-600">{property.address}, {property.city}, {property.state}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{property._count?.units_rel ?? property.units ?? 0}</p>
            <p className="text-xs text-gray-500">Units</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{property._count?.workOrders || 0}</p>
            <p className="text-xs text-gray-500">Work Orders</p>
          </div>
        </div>
        <Button className="w-full" icon={<ChevronRight className="w-4 h-4" />} onClick={() => navigate(`/properties/${property.id}`)}>View Property</Button>
      </div>
    </div>
  );
}

function AssetPanel({ asset, onClose, onEdit }: { asset: MapAsset; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="absolute top-4 right-4 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 z-10 overflow-hidden">
      <div className="bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <MapPinned className="w-4 h-4" />
          <span className="font-semibold text-sm truncate">{asset.name}</span>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={asset.status === 'ACTIVE' ? 'success' : asset.status === 'MAINTENANCE' ? 'warning' : asset.status === 'OFFLINE' ? 'danger' : 'default'} size="sm">{asset.status}</Badge>
          <Badge variant="default" size="sm">{asset.type.replace(/_/g, ' ')}</Badge>
        </div>
        <p className="text-sm text-gray-600">{asset.tenantName ? `Tenant: ${asset.tenantName}` : 'Portfolio asset'}</p>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
          <div className="bg-gray-50 rounded-xl p-2">
            <p className="text-xs uppercase text-gray-500">Lat</p>
            <p className="font-semibold">{asset.latitude.toFixed(4)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2">
            <p className="text-xs uppercase text-gray-500">Lng</p>
            <p className="font-semibold">{asset.longitude.toFixed(4)}</p>
          </div>
        </div>
        {asset.notes && <p className="text-sm text-gray-600 rounded-xl bg-slate-50 p-3">{asset.notes}</p>}
        <Button className="w-full" icon={<PencilLine className="w-4 h-4" />} onClick={onEdit}>Edit asset</Button>
      </div>
    </div>
  );
}

export default function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [propertiesList, setPropertiesList] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<MapAsset | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [draft, setDraft] = useState<AssetDraft>(defaultDraft());
  const [assetMode, setAssetMode] = useState<'create' | 'edit'>('create');
  const [assets, setAssets] = useState<MapAsset[]>(() => readStoredAssets());

  const { data } = useQuery({
    queryKey: ['properties-map'],
    queryFn: () => api.get('/properties', { params: { limit: 100 } }).then((r) => r.data),
  });

  const properties: Property[] = useMemo(() => toArray<Property>(data?.data?.properties ?? data?.properties), [data]);
  useEffect(() => { setPropertiesList(properties); }, [properties]);

  const mappedProperties = properties.filter((property) => property.latitude != null && property.longitude != null);
  const mappedAssets = useMemo(() => assets.filter((asset) => Number.isFinite(asset.latitude) && Number.isFinite(asset.longitude)), [assets]);

  useEffect(() => {
    localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    if (!MAPBOX_TOKEN) {
      setMapReady(false);
      return;
    }

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
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current;
    const markers: any[] = [];

    mappedProperties.forEach((property) => {
      const lat = property.latitude as number;
      const lng = property.longitude as number;
      const element = document.createElement('div');
      element.className = 'cursor-pointer';
      element.innerHTML = `<div style="background:#4f46e5;color:white;padding:6px 10px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid white;">${property.name.length > 20 ? `${property.name.substring(0, 18)}…` : property.name}</div>`;
      element.addEventListener('click', () => setSelectedProperty(property));
      const marker = new window.mapboxgl.Marker({ element }).setLngLat([lng, lat]).addTo(map);
      markers.push(marker);
    });

    mappedAssets.forEach((asset) => {
      const element = document.createElement('div');
      element.className = 'cursor-pointer';
      element.innerHTML = `<div style="background:#0ea5e9;color:white;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid white;">${asset.name.length > 16 ? `${asset.name.substring(0, 14)}…` : asset.name}</div>`;
      element.addEventListener('click', () => {
        setSelectedAsset(asset);
        setSelectedProperty(null);
      });
      const marker = new window.mapboxgl.Marker({ element }).setLngLat([asset.longitude, asset.latitude]).addTo(map);
      markers.push(marker);
    });

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [mapReady, mappedProperties, mappedAssets]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const style = satellite ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/streets-v12';
    mapInstance.current.setStyle(style);
  }, [satellite, mapReady]);

  const openCreateAsset = () => {
    const fallbackProperty = propertiesList[0]?.id || '';
    setAssetMode('create');
    setDraft(defaultDraft(fallbackProperty));
    setSelectedAsset(null);
    setShowAssetForm(true);
  };

  const openEditAsset = (asset: MapAsset) => {
    setAssetMode('edit');
    setSelectedAsset(asset);
    setDraft({
      name: asset.name,
      type: asset.type,
      status: asset.status,
      latitude: String(asset.latitude),
      longitude: String(asset.longitude),
      propertyId: asset.propertyId || propertiesList[0]?.id || '',
      tenantName: asset.tenantName || '',
      notes: asset.notes || '',
    });
    setShowAssetForm(true);
  };

  const handleSaveAsset = (event: FormEvent) => {
    event.preventDefault();

    const latitude = Number(draft.latitude);
    const longitude = Number(draft.longitude);
    if (!draft.name.trim() || Number.isNaN(latitude) || Number.isNaN(longitude)) return;

    if (assetMode === 'edit' && selectedAsset) {
      setAssets((current) => current.map((asset) => asset.id === selectedAsset.id ? {
        ...asset,
        name: draft.name.trim(),
        type: draft.type,
        status: draft.status,
        latitude,
        longitude,
        propertyId: draft.propertyId,
        tenantName: draft.tenantName.trim(),
        notes: draft.notes.trim(),
        updatedAt: new Date().toISOString(),
      } : asset));
    } else {
      const newAsset: MapAsset = {
        id: `asset-${Date.now()}`,
        name: draft.name.trim(),
        type: draft.type,
        status: draft.status,
        latitude,
        longitude,
        propertyId: draft.propertyId,
        tenantName: draft.tenantName.trim(),
        notes: draft.notes.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setAssets((current) => [newAsset, ...current]);
      setSelectedAsset(newAsset);
    }

    setShowAssetForm(false);
  };

  const handleDeleteAsset = (assetId: string) => {
    setAssets((current) => current.filter((asset) => asset.id !== assetId));
    setSelectedAsset(null);
    setShowAssetForm(false);
  };

  return (
    <Layout title="Map View">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Portfolio Map</h1>
            <p className="text-sm text-gray-500 mt-1">{mappedProperties.length} properties and {mappedAssets.length} onboarded assets are visible</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreateAsset}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <Plus className="w-4 h-4" /> Add asset
            </button>
            {MAPBOX_TOKEN && (
              <button
                type="button"
                onClick={() => setSatellite((value) => !value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${satellite ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'}`}
              >
                <Layers className="w-4 h-4" />{satellite ? 'Street View' : 'Satellite'}
              </button>
            )}
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 'calc(100vh - 14rem)' }}>
          {!MAPBOX_TOKEN ? (
            <div className="h-full bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center justify-center p-8">
              <Map className="w-16 h-16 text-indigo-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-700 mb-2">Map Integration Ready</h3>
              <p className="text-gray-500 text-sm text-center mb-6 max-w-md">
                Add your Mapbox public token to <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">VITE_MAPBOX_TOKEN</span> in your <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.env</span> file to enable the interactive portfolio map.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl">
                {properties.map((property) => (
                  <div key={property.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:border-indigo-300 cursor-pointer transition-all" onClick={() => setSelectedProperty(property)}>
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-2">
                      <Building2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm truncate">{property.name}</p>
                    <p className="text-xs text-gray-500 truncate">{property.city}, {property.state}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Badge variant="default" size="sm">{property._count?.units_rel ?? property.units ?? 0} units</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div ref={mapRef} className="w-full h-full" />
          )}

          {selectedProperty && <PropertyPanel property={selectedProperty} onClose={() => setSelectedProperty(null)} />}
          {selectedAsset && !showAssetForm && <AssetPanel asset={selectedAsset} onClose={() => setSelectedAsset(null)} onEdit={() => openEditAsset(selectedAsset)} />}

          {showAssetForm && (
            <div className="absolute top-4 left-4 w-[22rem] bg-white rounded-2xl border border-gray-200 shadow-xl z-10 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Asset onboarding</p>
                  <h3 className="text-lg font-semibold text-gray-900">{assetMode === 'edit' ? 'Edit asset' : 'New asset'}</h3>
                </div>
                <button type="button" onClick={() => setShowAssetForm(false)} className="rounded-full p-2 hover:bg-gray-100"><X className="w-4 h-4" /></button>
              </div>

              <form className="space-y-3" onSubmit={handleSaveAsset}>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Asset name</label>
                  <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Water meter, camera, HVAC, etc." required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Type</label>
                    <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as AssetType }))} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                      {['SMART_DEVICE', 'VEHICLE', 'HVAC', 'WATER', 'ELECTRICAL', 'SECURITY', 'PARKING', 'OTHER'].map((option) => (
                        <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Status</label>
                    <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as AssetStatus }))} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                      {['ACTIVE', 'MAINTENANCE', 'OFFLINE', 'REPLACEMENT'].map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Latitude</label>
                    <input type="number" step="0.0001" value={draft.latitude} onChange={(event) => setDraft((current) => ({ ...current, latitude: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Longitude</label>
                    <input type="number" step="0.0001" value={draft.longitude} onChange={(event) => setDraft((current) => ({ ...current, longitude: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" required />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Property</label>
                  <select value={draft.propertyId} onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                    <option value="">No property linked</option>
                    {propertiesList.map((property) => (
                      <option key={property.id} value={property.id}>{property.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Assigned tenant / contact</label>
                  <input value={draft.tenantName} onChange={(event) => setDraft((current) => ({ ...current, tenantName: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Tenant or site contact" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Notes</label>
                  <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" placeholder="Maintenance details, installation notes, vendor coverage, or tenant updates." />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button type="submit" icon={<Save className="w-4 h-4" />}>Save asset</Button>
                  {assetMode === 'edit' && selectedAsset && (
                    <button type="button" onClick={() => handleDeleteAsset(selectedAsset.id)} className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">Delete</button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
