import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, Phone, Mail, MapPin, Briefcase, Search, Filter } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import api from '../lib/api';
import { cn, toArray } from '../lib/utils';

const SPECIALTIES = ['','PLUMBING','ELECTRICAL','HVAC','CARPENTRY','PAINTING','ROOFING','LANDSCAPING','CLEANING','GENERAL','OTHER'];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i=>(
        <Star key={i} className={cn('w-3.5 h-3.5', i<=Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200')} />
      ))}
      <span className="ml-1 text-xs text-gray-500">{rating?.toFixed(1)||'—'}</span>
    </div>
  );
}

export default function Contractors() {
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');
  const { data, isLoading } = useQuery({ queryKey:['contractors', specialty], queryFn: () => api.get('/contractors', { params: specialty ? { specialty } : {} }).then(r=>r.data) });
  const contractorList = toArray<any>(data?.data?.contractors ?? data?.contractors);
  const contractors = contractorList.filter((c:any)=>!search || `${c.companyName || c.user?.firstName || ''} ${c.user?.lastName || ''}`.trim().toLowerCase().includes(search.toLowerCase()) || (c.user?.email || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout title="Contractors">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contractor Directory</h1>
          <p className="text-sm text-gray-500 mt-1">Browse and connect with verified service professionals</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search contractors..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {SPECIALTIES.map(s=>(
              <button key={s} onClick={()=>setSpecialty(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${specialty===s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s||'All'}</button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>
        ) : contractors.length === 0 ? (
          <EmptyState icon={<Briefcase className="w-12 h-12" />} title="No contractors found" description="No contractors match your current filters" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contractors.map((c:any)=>(
              <div key={c.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                    {(c.companyName||c.user?.firstName||'?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{c.companyName||`${c.user?.firstName||''} ${c.user?.lastName||''}`.trim()||'Unknown'}</h3>
                    <StarRating rating={c.rating||0} />
                    <p className="text-xs text-gray-400 mt-0.5">{c.completedJobs||0} jobs completed</p>
                  </div>
                </div>

                {c.specialties?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {c.specialties.slice(0,4).map((s:string)=>(
                      <Badge key={s} variant="default" size="sm">{s.replace(/_/g,' ')}</Badge>
                    ))}
                    {c.specialties.length > 4 && <Badge variant="default" size="sm">+{c.specialties.length-4}</Badge>}
                  </div>
                )}

                <div className="space-y-2 border-t border-gray-100 pt-4">
                  {c.user?.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{c.user.email}</span>
                    </div>
                  )}
                  {c.user?.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>{c.user.phone}</span>
                    </div>
                  )}
                  {c.serviceArea && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{c.serviceArea}</span>
                    </div>
                  )}
                </div>

                {c.bio && <p className="text-xs text-gray-500 mt-3 line-clamp-2">{c.bio}</p>}

                <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                  <a href={`mailto:${c.user?.email}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                    <Mail className="w-3.5 h-3.5" />Contact
                  </a>
                  <a href={`tel:${c.user?.phone}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-green-50 hover:text-green-600 transition-colors">
                    <Phone className="w-3.5 h-3.5" />Call
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
