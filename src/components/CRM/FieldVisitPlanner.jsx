import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, App, Badge, Button, Card, Col, DatePicker, Divider, Empty, Form, Grid, Input,
  InputNumber, Modal, Popconfirm, Row, Select, Space, Steps, Switch, Tag, TimePicker,
  Tooltip, Typography,
} from 'antd';
import { useJsApiLoader } from '@react-google-maps/api';
import {
  AimOutlined, ArrowLeftOutlined, CarOutlined, CheckCircleOutlined, ClockCircleOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
  CloudSyncOutlined, CloseOutlined, CompassOutlined, DeleteOutlined, DragOutlined, EnvironmentOutlined,
  ExpandOutlined, CompressOutlined,
  GlobalOutlined, HomeOutlined, PlusOutlined, RetweetOutlined, RocketOutlined,
  SaveOutlined, SearchOutlined, ShopOutlined, StarOutlined, SwapOutlined, ThunderboltOutlined, UserAddOutlined,
} from '@ant-design/icons';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { fetchCountries } from '../../services/countriesService';
import FieldVisitLegForm from './FieldVisitLegForm';
import FieldVisitChecklistPanel from './FieldVisitChecklistPanel';
import FieldVisitPlannerMapPanel from './FieldVisitPlannerMapPanel';
import FieldVisitReviewStep from './FieldVisitReviewStep';
import { hasValidCoordinates, GMAP_LIBRARIES, API_BASE, getAuthHeaders, STOP_COLORS, sanitizeLocationLabel } from './fieldVisitUtils';
import { useAuth } from '../../contexts/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;
const GMAP_API_KEY_FVP = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const INTER_STOP_TRANSPORT = [
  { value: 'drive', label: 'Drive', icon: '🚗' },
  { value: 'flight', label: 'Flight', icon: '✈️' },
  { value: 'train', label: 'Train', icon: '🚄' },
  { value: 'bus', label: 'Bus', icon: '🚌' },
  { value: 'taxi', label: 'Taxi', icon: '🚕' },
  { value: 'ferry', label: 'Ferry', icon: '⛴️' },
  { value: 'walk', label: 'Walk', icon: '🚶' },
];

const CUSTOM_STOP_LABELS = [
  { value: 'hotel', label: 'Hotel', icon: '🏨' },
  { value: 'airport', label: 'Airport', icon: '✈️' },
  { value: 'meeting', label: 'Meeting Point', icon: '🤝' },
  { value: 'restaurant', label: 'Restaurant', icon: '🍽️' },
  { value: 'office', label: 'Office', icon: '🏢' },
  { value: 'waypoint', label: 'Waypoint', icon: '📍' },
  { value: 'other', label: 'Other', icon: '📌' },
];
const TRANSPORT_OPTIONS = [
  { value: 'car', label: 'Car / Rental' },
  { value: 'flight', label: 'Flight' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'taxi', label: 'Taxi / Rideshare' },
  { value: 'ferry', label: 'Ferry / Boat' },
  { value: 'other', label: 'Other' },
];

// Approximate bounding boxes used as hard locationRestriction for Google Places searchByText.
// Using locationRestriction (hard) instead of locationBias (soft viewport) prevents
// brand-recognition spillover — e.g. "Rotana" is UAE-associated but user may be searching in SA.
const COUNTRY_BOUNDS = {
  'Saudi Arabia':           { north: 32.15, south: 16.37, west: 34.49, east: 55.67 },
  'United Arab Emirates':   { north: 26.09, south: 22.63, west: 51.59, east: 56.38 },
  'Kuwait':                 { north: 30.10, south: 28.53, west: 46.55, east: 48.43 },
  'Qatar':                  { north: 26.18, south: 24.47, west: 50.75, east: 51.65 },
  'Bahrain':                { north: 26.33, south: 25.79, west: 50.27, east: 50.84 },
  'Oman':                   { north: 26.43, south: 16.65, west: 51.97, east: 59.86 },
  'Jordan':                 { north: 33.37, south: 29.19, west: 34.96, east: 39.30 },
  'Lebanon':                { north: 34.69, south: 33.05, west: 35.10, east: 36.63 },
  'Egypt':                  { north: 31.67, south: 22.00, west: 24.70, east: 37.06 },
  'Turkey':                 { north: 42.11, south: 35.81, west: 25.66, east: 44.83 },
  'Pakistan':               { north: 37.10, south: 23.64, west: 60.87, east: 77.84 },
  'India':                  { north: 35.51, south:  6.75, west: 68.16, east: 97.40 },
  'Iraq':                   { north: 37.38, south: 29.06, west: 38.79, east: 48.58 },
  'Iran':                   { north: 39.78, south: 25.06, west: 44.03, east: 63.33 },
  'Israel':                 { north: 33.34, south: 29.50, west: 34.27, east: 35.90 },
  'Syria':                  { north: 37.33, south: 32.31, west: 35.73, east: 42.38 },
};

// Parse transport_mode from DB: may be JSON array string or legacy single string
const parseTransportMode = (raw) => {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [v]; } catch { return [raw]; }
};

// Serialize array back for DB storage
const serializeTransportMode = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.length === 1 ? arr[0] : JSON.stringify(arr);
};

const createStop = () => ({
  local_id: crypto.randomUUID(),
  stop_type: 'customer',
  custom_label: null, // hotel | airport | meeting | waypoint | restaurant | office | other
  customer_id: null,
  prospect_id: null,
  stop_city: null,
  stop_country: null,
  visit_date: null,
  visit_time: null,
  duration_mins: 60,
  latitude: null,
  longitude: null,
  address_snapshot: '',
  objectives: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  coordinates_persist_status: null,
  transport_to_next: null, // drive | flight | train | bus | taxi | ferry | walk
});

const extractCityFromAddressSnapshot = (address) => {
  const parts = String(address || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 2] || null;
};

const isLikelyCityName = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return false;
  if (value.length < 2 || value.length > 60) return false;
  if (/\d{3,}/.test(value)) return false;
  if (/\b[A-Z0-9]{4,8}\+[A-Z0-9]{2,4}\b/i.test(value)) return false;
  if (/\b(airport|international|terminal|runway|motorway|highway|street|road|building|group|company|hotel|mall|market)\b/i.test(value)) return false;
  return true;
};

const cleanCityName = (raw) => {
  if (!raw) return null;
  let c = raw.replace(/\s*[\u2014\u2013]\s*.*/g, '').trim();    // strip after em/en-dash
  c = c.replace(/\b[A-Z0-9]{4,6}\+[A-Z0-9]{2,4}\b/gi, '').trim(); // strip plus codes
  c = c.replace(/\s{2,}/g, ' ').trim();
  if (!isLikelyCityName(c)) return null;
  return c || null;
};

const cityFromGeocodeAddress = (address) => cleanCityName(
  address?.city
  || address?.town
  || address?.village
  || address?.municipality
  || address?.county
  || null
);

const AR_COUNTRY_ALIASES = {
  'سوريا': 'Syria',
  'الإمارات العربية المتحدة': 'United Arab Emirates',
  'السعودية': 'Saudi Arabia',
  'المملكة العربية السعودية': 'Saudi Arabia',
};

const hasLatinChars = (value) => /[A-Za-z]/.test(String(value || ''));

const isEntityLinkedStop = (stop) => Boolean(stop?.customer_id || stop?.prospect_id);

const hasResolvedStopCoordinates = (stop) => {
  if (!hasValidCoordinates(stop?.latitude, stop?.longitude)) return false;
  if (!isEntityLinkedStop(stop)) return true;
  return stop?.coordinates_persist_status === 'saved' || stop?.coordinates_persist_status === 'auto_resolved';
};

const extractCoordinatesFromUrlText = (urlText) => {
  const text = String(urlText || '');
  if (!text) return null;
  const patterns = [
    /@([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/,
    /!3d([+-]?\d+\.?\d*)!4d([+-]?\d+\.?\d*)/,
    /[?&](?:q|ll|center)=([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/,
    /\/(?:dir|search)\/([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/,
    /\/place\/[^/]+\/@([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  try {
    const decoded = decodeURIComponent(text);
    if (decoded !== text) return extractCoordinatesFromUrlText(decoded);
  } catch (_) { /* ignore decode errors */ }

  return null;
};

/* ================================================================
   ROUTE INTELLIGENCE HELPERS  (pure, module-level)
   ================================================================ */
const parseTimeSec = (str) => {
  if (!str) return null;
  const parts = String(str).split(':').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
};

const formatTimeSec = (sec) => {
  const norm = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(norm / 3600);
  const m = Math.floor((norm % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const fmtDuration = (sec) => {
  const s = Math.abs(Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

/* Drive / transit strip rendered between consecutive stop cards */
const LegStrip = ({ leg, loading, bufferMins, transportMode, onTransportChange }) => {
  const lineStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 24px', fontSize: 12 };
  const transportTag = transportMode && transportMode !== 'drive'
    ? (INTER_STOP_TRANSPORT.find(t => t.value === transportMode) || { icon: '🚗', label: transportMode })
    : null;

  // Transport mode selector (inline)
  const transportSelector = onTransportChange ? (
    <select
      value={transportMode || 'drive'}
      onChange={e => onTransportChange(e.target.value)}
      style={{ fontSize: 11, border: '1px solid #d9d9d9', borderRadius: 4, padding: '1px 4px', background: '#fff', cursor: 'pointer', marginLeft: 'auto' }}
    >
      {INTER_STOP_TRANSPORT.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
    </select>
  ) : null;

  if (loading) {
    return (
      <div style={lineStyle}>
        <span style={{ color: '#d9d9d9' }}>▼</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Calculating route…</Typography.Text>
        {transportSelector}
      </div>
    );
  }
  if (leg?.noCoords) {
    return (
      <div style={lineStyle}>
        <span style={{ color: '#faad14' }}>▼</span>
        <Typography.Text style={{ fontSize: 12, color: '#faad14' }}>Missing location — no route available</Typography.Text>
        {transportSelector}
      </div>
    );
  }
  // Cross-country transit leg (flight / train / etc.)
  if (leg?.transit) {
    const tl = leg.transitLeg;
    const modeLabel = tl ? (tl.mode === 'flight' ? `✈ ${tl.flight_number || 'Flight'}` : `🚄 ${tl.train_number || tl.mode || 'Transit'}`) : '✈ Transit';
    const durationTxt = leg.durationSec ? fmtDuration(leg.durationSec) : null;
    const fromTo = tl ? [tl.from_label || tl.dep_airport, tl.to_label || tl.arr_airport].filter(Boolean).join(' → ') : null;
    return (
      <div style={{ ...lineStyle, background: 'linear-gradient(90deg,#fff7e6 0%,transparent 100%)', borderLeft: '2px dashed #faad14', borderRadius: 4, margin: '1px 0' }}>
        <span style={{ color: '#faad14', fontSize: 10 }}>▼</span>
        <Typography.Text style={{ fontSize: 12, color: '#d48806', fontWeight: 500 }}>{modeLabel}</Typography.Text>
        {fromTo && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{fromTo}</Typography.Text>}
        {durationTxt && <><Typography.Text type="secondary" style={{ fontSize: 12 }}>·</Typography.Text><Typography.Text style={{ fontSize: 12 }}>{durationTxt}</Typography.Text></>}
        {transportSelector}
      </div>
    );
  }
  // Cross-country but no matching transit leg defined
  if (leg?.crossCountry) {
    // User selected Flight for this cross-country segment — show flight strip
    if (transportMode === 'flight') {
      return (
        <div style={{ ...lineStyle, background: 'linear-gradient(90deg,#fff7e6 0%,transparent 100%)', borderLeft: '2px dashed #faad14', borderRadius: 4, margin: '1px 0' }}>
          <span style={{ color: '#faad14', fontSize: 10 }}>▼</span>
          <Typography.Text style={{ fontSize: 12, color: '#d48806', fontWeight: 500 }}>✈ Flight</Typography.Text>
          {transportSelector}
        </div>
      );
    }
    return (
      <div style={{ ...lineStyle, background: 'linear-gradient(90deg,#fff1f0 0%,transparent 100%)', borderLeft: '2px dashed #ff7875', borderRadius: 4, margin: '1px 0' }}>
        <span style={{ color: '#ff7875', fontSize: 10 }}>▼</span>
        <Typography.Text style={{ fontSize: 12, color: '#cf1322' }}>⚠ Different country — add a transit leg in Trip Info or select transport below</Typography.Text>
        {transportSelector}
      </div>
    );
  }
  if (!leg || leg.error || !leg.distanceTxt) {
    return (
      <div style={lineStyle}>
        <span style={{ color: '#f0f0f0' }}>▼</span>
        {transportTag && <Typography.Text style={{ fontSize: 12 }}>{transportTag.icon} {transportTag.label}</Typography.Text>}
        {transportSelector}
      </div>
    );
  }
  return (
    <div style={{ ...lineStyle, background: 'linear-gradient(90deg,#f0f5ff 0%,transparent 100%)', borderLeft: '2px dashed #adc6ff', borderRadius: 4, margin: '1px 0' }}>
      <span style={{ color: '#adc6ff', fontSize: 10 }}>▼</span>
      <CarOutlined style={{ color: '#1677ff', fontSize: 12 }} />
      <Typography.Text style={{ fontSize: 12, color: '#1677ff', fontWeight: 500 }}>{leg.distanceTxt}</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>·</Typography.Text>
      <Typography.Text style={{ fontSize: 12 }}>{leg.durationTxt} drive</Typography.Text>
      {bufferMins > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>· +{bufferMins}min buffer</Typography.Text>
      )}
      {transportSelector}
    </div>
  );
};

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
const FieldVisitPlanner = () => {
  const navigate = useNavigate();
  const { id: routeTripId } = useParams();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { user } = useAuth();
  // Plan Trip For: Level 6+ only (admin = L7, sales_manager = L6)
  // manager role covers L4 and L5 — they plan only for themselves
  const isManager = ['admin', 'sales_manager'].includes(user?.role) ||
    (user?.designation_level != null && user.designation_level >= 6);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const [stops, setStops] = useState([]);
  const formSnapshotRef = useRef({}); // persists form values across step changes

  // Manager: rep selector for creating trips on behalf of reps
  const [salesReps, setSalesReps] = useState([]);
  const [selectedRepId, setSelectedRepId] = useState(null); // null = self

  // Lookups
  const [countries, setCountries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [loadingLookups, setLoadingLookups] = useState(true);

  // Draft modal
  const [draftModalType, setDraftModalType] = useState(null); // 'customers' | 'prospects' | null
  const [draftSelection, setDraftSelection] = useState([]);
  const [draftCountryScoped, setDraftCountryScoped] = useState(true);
  const [draftCountryFilter, setDraftCountryFilter] = useState(null); // country name for modal filter

  // Persisted step-0 form values — Form.useWatch() stops working once the
  // <Form> component unmounts (step 1+), so we save critical values to state
  // when the user clicks "Next" so they remain available on steps 1 and 2.
  const [savedTripType, setSavedTripType] = useState(null);
  const [savedDestinations, setSavedDestinations] = useState([]);
  const [savedDeparture, setSavedDeparture] = useState(null);   // 'YYYY-MM-DD'
  const [savedReturn, setSavedReturn] = useState(null);         // 'YYYY-MM-DD'

  // New prospect modal
  const [showNewProspect, setShowNewProspect] = useState(false);
  const [prospectForm] = Form.useForm();
  const [savingProspect, setSavingProspect] = useState(false);

  // Pre-visit briefs
  const [briefByStop, setBriefByStop] = useState({});
  const [briefLoadingByStop, setBriefLoadingByStop] = useState({});

  // Legs, checklist, templates, geocode
  const [legs, setLegs] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [showPrevTripsModal, setShowPrevTripsModal] = useState(false);
  const [prevTrips, setPrevTrips] = useState([]);
  const [prevTripsLoading, setPrevTripsLoading] = useState(false);
  const [geocodingIdx, setGeocodingIdx] = useState(null);
  const [geocodeQuery, setGeocodeQuery] = useState('');
  const [geocodeResults, setGeocodeResults] = useState([]);
  const [showGeocodeModal, setShowGeocodeModal] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [mapSearching, setMapSearching] = useState(false);
  const [stopSearch, setStopSearch] = useState({ idx: null, query: '', results: [], loading: false });
  const [sharedLocationsByKey, setSharedLocationsByKey] = useState({});
  const [sharedLocationsLoadingByKey, setSharedLocationsLoadingByKey] = useState({});
  const [plannerCountryCode, setPlannerCountryCode] = useState('AE');
  const [pinTargetIdx, setPinTargetIdx] = useState(null);
  const [showGoogleUrlModal, setShowGoogleUrlModal] = useState(false);
  const [googleUrlTargetIdx, setGoogleUrlTargetIdx] = useState(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [savingLocationIdx, setSavingLocationIdx] = useState(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [reviewShowUnsavedOnly, setReviewShowUnsavedOnly] = useState(false);
  const [optimizePreviewPending, setOptimizePreviewPending] = useState(false);
  const [editingTripId, _setEditingTripId] = useState(null);
  const editingTripIdRef = useRef(null);
  const setEditingTripId = (id) => { editingTripIdRef.current = id; _setEditingTripId(id); };
  const loadedRouteTripIdRef = useRef(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState(null);
  const [existingDraftsCount, setExistingDraftsCount] = useState(0);
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);

  // Map
  const mapContainerRef = React.useRef(null);
  const mapCardWrapRef = React.useRef(null);
  const mapInstanceRef = React.useRef(null);
  const mapMarkersRef = React.useRef([]);
  const mapInfoWindowsRef = React.useRef([]);
  const mapRouteRef = React.useRef(null);
  const mapRouteReqSeqRef = React.useRef(0);
  const sharedLocationCacheRef = React.useRef(new Map());
  const sharedLocationLoadingRef = React.useRef(new Set());
  const applyCoordinatesToStopRef = React.useRef(null);
  const pinTargetIdxRef = React.useRef(null);
  const stopsRef = React.useRef(stops);
  const preOptimizationStopsRef = React.useRef(null);
  const modalRef = React.useRef(null);
  const panToStopIdxRef = React.useRef(null); // index of stop to pan-to after next marker refresh
  const [mapReady, setMapReady] = useState(false);

  // Route intelligence
  const [routeLegs, setRouteLegs] = useState([]);       // [{distanceM, distanceTxt, durationSec, durationTxt, error, noCoords}]
  const [routeLegsLoading, setRouteLegsLoading] = useState(false);
  const [bufferMins, setBufferMins] = useState(15);
  const directionsServiceRef = useRef(null);             // Google Maps DirectionsService instance
  const routeFetchSeqRef = useRef(0);                    // stale-response guard
  const geoMetaLookupInFlightRef = useRef(new Set());
  const geoMetaLookupRetryAfterRef = useRef(new Map());  // key -> timestamp (ms)

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GMAP_API_KEY_FVP,
    libraries: GMAP_LIBRARIES,
    language: 'en',
    version: 'weekly',
  });

  // Keep refs in sync so the map click handler always sees latest values
  // without requiring the map init effect to re-run (which destroys/recreates the map).
  stopsRef.current = stops;
  pinTargetIdxRef.current = pinTargetIdx;
  modalRef.current = modal;

  const tripType = Form.useWatch('trip_type', form) || savedTripType || 'local';
  const selectedCountryCode = Form.useWatch('country_code', form);
  const visaRequired = Form.useWatch('visa_required', form);
  const transportModeVal = Form.useWatch('transport_mode', form);
  // normalise to array regardless of whether form value is array or string
  const transportMode = Array.isArray(transportModeVal) ? transportModeVal : (transportModeVal ? [transportModeVal] : []);
  // Fall back to savedDestinations once the Form unmounts at step 1+
  const destinationCountries = Form.useWatch('destination_countries', form) || savedDestinations;

  const effectiveCountryCode = plannerCountryCode || (tripType === 'local' ? 'AE' : undefined);

  // All countries involved in this trip (origin + destinations) — codes and names
  const tripCountryCodes = useMemo(() => {
    if (tripType === 'local') return [effectiveCountryCode || 'AE'];
    return [effectiveCountryCode || 'AE', ...destinationCountries].filter(Boolean);
  }, [tripType, effectiveCountryCode, destinationCountries]);

  const tripCountryNames = useMemo(() => {
    return tripCountryCodes.map(code => {
      const c = countries.find(r => r.country_code_2 === code);
      return c ? c.country_name : code;
    });
  }, [tripCountryCodes, countries]);

  // Resolve any country input (code like "SA", variant like "Kingdom Of Saudi Arabia") to canonical name
  const resolveCountryName = useCallback((input) => {
    if (!input || !countries.length) return input || '';
    const alias = AR_COUNTRY_ALIASES[String(input).trim()];
    const s = (alias || String(input)).trim();
    // Direct name match
    const byName = countries.find(c => c.country_name?.toLowerCase() === s.toLowerCase());
    if (byName) return byName.country_name;
    // 2-letter code match
    const byCode2 = countries.find(c => c.country_code_2?.toLowerCase() === s.toLowerCase());
    if (byCode2) return byCode2.country_name;
    // 3-letter code match
    const byCode3 = countries.find(c => c.country_code_3?.toLowerCase() === s.toLowerCase());
    if (byCode3) return byCode3.country_name;
    // Partial / contains match (handles "Kingdom Of Saudi Arabia" matching "Saudi Arabia")
    const byPartial = countries.find(c => c.country_name && (s.toLowerCase().includes(c.country_name.toLowerCase()) || c.country_name.toLowerCase().includes(s.toLowerCase())));
    if (byPartial) return byPartial.country_name;
    return s; // fallback to original
  }, [countries]);

  // Backfill city/country for legacy saved stops that only have coordinates.
  useEffect(() => {
    const now = Date.now();
    const targets = [];
    stops.forEach((s, idx) => {
      if (!hasValidCoordinates(s.latitude, s.longitude)) return;
      if (s.stop_city && s.stop_country) return;
      const lat = Number(s.latitude);
      const lng = Number(s.longitude);
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (geoMetaLookupInFlightRef.current.has(key)) return;
      const retryAfter = geoMetaLookupRetryAfterRef.current.get(key) || 0;
      if (retryAfter > now) return;
      targets.push({ idx, lat, lng, key });
    });
    if (!targets.length) return;

    targets.forEach(({ idx, lat, lng, key }) => {
      geoMetaLookupInFlightRef.current.add(key);
      axios.get(`${API_BASE}/api/crm/field-trips/reverse-geocode`, {
        headers: getAuthHeaders(),
        params: { lat, lng },
      }).then((res) => {
        const row = res.data?.data || null;
        if (!row) return;
        const noGeoMeta = !row.city && !row.country;
        if (row.fallback || noGeoMeta) {
          geoMetaLookupRetryAfterRef.current.set(key, Date.now() + 5 * 60 * 1000);
          return;
        }
        const city = cleanCityName(row.city || null);
        const country = resolveCountryName(row.country) || row.country || null;
        setStops((prev) => prev.map((stop, i) => {
          if (i !== idx) return stop;
          return {
            ...stop,
            stop_city: stop.stop_city || city || null,
            stop_country: stop.stop_country || country || null,
          };
        }));
      }).catch(() => {
        geoMetaLookupRetryAfterRef.current.set(key, Date.now() + 5 * 60 * 1000);
      }).finally(() => {
        geoMetaLookupInFlightRef.current.delete(key);
      });
    });
  }, [stops, resolveCountryName]);

  const buildSharedLocationKey = useCallback((countryName, label) => {
    const normalizedCountry = String(resolveCountryName(countryName) || countryName || '').trim().toLowerCase();
    const normalizedLabel = String(label || '').trim().toLowerCase();
    return `${normalizedCountry}__${normalizedLabel}`;
  }, [resolveCountryName]);

  const fetchSharedLocations = useCallback(async ({ countryName, label, query = '' }) => {
    const resolvedCountry = String(resolveCountryName(countryName) || countryName || '').trim();
    if (!resolvedCountry) return [];
    const normalizedLabel = String(label || '').trim().toLowerCase();
    const normalizedQuery = String(query || '').trim();
    const key = buildSharedLocationKey(resolvedCountry, normalizedLabel);

    if (!normalizedQuery && sharedLocationCacheRef.current.has(key)) {
      const cached = sharedLocationCacheRef.current.get(key) || [];
      setSharedLocationsByKey(prev => ({ ...prev, [key]: cached }));
      return cached;
    }

    if (sharedLocationLoadingRef.current.has(key)) return [];

    sharedLocationLoadingRef.current.add(key);
    setSharedLocationsLoadingByKey(prev => ({ ...prev, [key]: true }));

    try {
      const params = { country: resolvedCountry, limit: 20 };
      if (normalizedLabel) params.label = normalizedLabel;
      if (normalizedQuery) params.q = normalizedQuery;

      let data = [];
      const primaryRes = await axios.get(`${API_BASE}/api/crm/field-trips/locations`, {
        headers: getAuthHeaders(),
        params,
      });
      data = Array.isArray(primaryRes.data?.data) ? primaryRes.data.data : [];

      if (!normalizedQuery && normalizedLabel && data.length === 0) {
        const fallbackRes = await axios.get(`${API_BASE}/api/crm/field-trips/locations`, {
          headers: getAuthHeaders(),
          params: { country: resolvedCountry, limit: 20 },
        });
        data = Array.isArray(fallbackRes.data?.data) ? fallbackRes.data.data : [];
      }

      const normalizedData = data
        .map((row) => ({
          ...row,
          lat: Number(row?.lat),
          lng: Number(row?.lng),
          use_count: Number(row?.use_count) || 0,
        }))
        .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));

      if (!normalizedQuery) sharedLocationCacheRef.current.set(key, normalizedData);
      setSharedLocationsByKey(prev => ({ ...prev, [key]: normalizedData }));
      return normalizedData;
    } catch {
      setSharedLocationsByKey(prev => ({ ...prev, [key]: prev[key] || [] }));
      return [];
    } finally {
      sharedLocationLoadingRef.current.delete(key);
      setSharedLocationsLoadingByKey(prev => ({ ...prev, [key]: false }));
    }
  }, [buildSharedLocationKey, resolveCountryName]);

  // Destination-only country names (no origin) — used for modal filters and New Lead.
  // For local trips the single country IS the destination; for international trips
  // the origin (home country) is excluded since the rep is traveling FROM there.
  const destinationCountryNames = useMemo(() => {
    if (tripType === 'local') return tripCountryNames; // only one country anyway
    return destinationCountries
      .map(code => { const c = countries.find(r => r.country_code_2 === code); return c ? c.country_name : code; })
      .filter(Boolean);
  }, [tripType, destinationCountries, countries, tripCountryNames]);

  // When trip type changes, auto-select UAE for both local and international (origin country)
  // Also reset checklist since local/international have different default items
  useEffect(() => {
    if (tripType === 'local') {
      form.setFieldValue('country_code', 'AE');
      setPlannerCountryCode('AE');
    } else if (tripType === 'international' && !selectedCountryCode) {
      form.setFieldValue('country_code', 'AE');
      setPlannerCountryCode('AE');
    }
    setChecklist([]);
  }, [tripType]);

  // Persist selected country even when the step-0 form is unmounted.
  useEffect(() => {
    if (selectedCountryCode) setPlannerCountryCode(selectedCountryCode);
  }, [selectedCountryCode]);

  const selectedCountryName = useMemo(() => {
    if (!effectiveCountryCode) return '';
    const c = countries.find(c => c.country_code_2 === effectiveCountryCode);
    return c ? c.country_name : '';
  }, [effectiveCountryCode, countries]);

  const apiCountryFilter = useMemo(() => {
    if (!effectiveCountryCode) return null;
    if (effectiveCountryCode === 'AE') return 'UAE';
    return selectedCountryName || null;
  }, [effectiveCountryCode, selectedCountryName]);

  // Country options: local = UAE only; international = UAE first (origin), then all others
  const countryOptions = useMemo(() => {
    if (tripType === 'local') {
      return countries.filter(c => c.country_code_2 === 'AE').map(c => ({ value: c.country_code_2, label: `${c.country_name} (${c.country_code_2})` }));
    }
    const uae = countries.filter(c => c.country_code_2 === 'AE').map(c => ({ value: c.country_code_2, label: `${c.country_name} (${c.country_code_2})` }));
    const rest = countries.filter(c => c.country_code_2 !== 'AE').map(c => ({ value: c.country_code_2, label: `${c.country_name} (${c.country_code_2})` }));
    return [...uae, ...rest];
  }, [countries, tripType]);

  // Destination country options: all countries except the selected origin
  const destinationCountryOptions = useMemo(() => {
    return countries
      .filter(c => c.country_code_2 !== selectedCountryCode)
      .map(c => ({ value: c.country_code_2, label: `${c.country_name} (${c.country_code_2})` }));
  }, [countries, selectedCountryCode]);

  /* ---------- load static lookups ---------- */
  useEffect(() => {
    const loadStatic = async () => {
      setLoadingLookups(true);
      const [countryRes] = await Promise.allSettled([
        fetchCountries({ active: true }).then(c => ({ data: { countries: c } })),
      ]);
      if (countryRes.status === 'fulfilled') {
        const rows = countryRes.value?.data?.countries || countryRes.value?.data?.data || countryRes.value?.data || [];
        setCountries(Array.isArray(rows) ? rows : []);
      }
      setLoadingLookups(false);
    };
    loadStatic();
  }, []);

  /* ---------- load sales reps for manager rep selector ---------- */
  useEffect(() => {
    if (!isManager) return;
    const loadReps = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/crm/sales-reps`, { headers: getAuthHeaders() });
        const reps = res.data?.data || [];
        setSalesReps(reps.filter(r => r.user_id));
      } catch { /* ignore */ }
    };
    loadReps();
  }, [isManager]);

  /* ---------- load customers/prospects ---------- */
  // For international trips: load ALL (no country filter) so user can pick from any destination country.
  // For local trips: keep country filter as before.
  useEffect(() => {
    const loadEntities = async () => {
      setLoadingLookups(true);
      const params = (tripType === 'international') ? {} : (apiCountryFilter ? { country: apiCountryFilter } : {});
      if (selectedRepId) params.forRepId = selectedRepId;
      const [custRes, prospRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/api/crm/my-customers`, { headers: getAuthHeaders(), params }),
        axios.get(`${API_BASE}/api/crm/my-prospects`, { headers: getAuthHeaders(), params }),
      ]);
      if (custRes.status === 'fulfilled') {
        const rows = custRes.value?.data?.data?.customers || [];
        setCustomers(Array.isArray(rows) ? rows : []);
      } else {
        setCustomers([]);
      }
      if (prospRes.status === 'fulfilled') {
        const rows = prospRes.value?.data?.data?.prospects || [];
        setProspects(Array.isArray(rows) ? rows : []);
      } else {
        setProspects([]);
      }
      setLoadingLookups(false);
    };
    loadEntities();
  }, [apiCountryFilter, selectedRepId, tripType]);

  /* ---------- country-scoped filtering ---------- */
  // Fuzzy country match: "Saudi Arabia" matches "Kingdom Of Saudi Arabia" etc.
  const countryMatch = useCallback((recordCountry, targetName) => {
    if (!recordCountry || !targetName) return false;
    const rc = String(recordCountry).trim().toLowerCase();
    const tn = String(targetName).trim().toLowerCase();
    if (rc === tn || rc.includes(tn) || tn.includes(rc)) return true;
    // Resolve both sides to their canonical country name via DB and compare
    const rcResolved = resolveCountryName(recordCountry)?.toLowerCase() || rc;
    const tnResolved = resolveCountryName(targetName)?.toLowerCase() || tn;
    return rcResolved === tnResolved;
  }, [resolveCountryName]);

  const filteredCustomers = useMemo(() => {
    if (!draftCountryScoped) return customers;
    // For international trips: only filter when the user explicitly picks a destination
    // country in the modal — never auto-apply the origin (home) country as default.
    const target = draftCountryFilter || (tripType === 'local' ? selectedCountryName : null);
    if (!target) return customers;
    return customers.filter(c => countryMatch(c.country || c.primary_country, target));
  }, [customers, draftCountryScoped, draftCountryFilter, selectedCountryName, countryMatch, tripType]);

  const filteredProspects = useMemo(() => {
    if (!draftCountryScoped) return prospects;
    const target = draftCountryFilter || (tripType === 'local' ? selectedCountryName : null);
    if (!target) return prospects;
    return prospects.filter(p => countryMatch(p.country, target));
  }, [prospects, draftCountryScoped, draftCountryFilter, selectedCountryName, countryMatch, tripType]);

  /* ---------- customer / prospect options (country-filtered for stop selects) ---------- */
  const allCustomerOptions = useMemo(() => customers.map(c => {
    const cid = c.customer_id || c.id;
    return { value: cid, label: `${c.customer_name || c.display_name || `#${cid}`}`, data: c };
  }), [customers]);

  const allProspectOptions = useMemo(() => prospects.map(p => {
    return { value: p.id, label: `${p.customer_name || `Prospect #${p.id}`}`, data: p };
  }), [prospects]);

  const customerMap = useMemo(() => new Map(allCustomerOptions.map(c => [c.value, c])), [allCustomerOptions]);
  const prospectMap = useMemo(() => new Map(allProspectOptions.map(p => [p.value, p])), [allProspectOptions]);

  const resolveStopGeoMeta = useCallback((stop, customerData, prospectData, fallbackCountry = null) => {
    const rawCountry = stop.stop_country || customerData?.country || customerData?.primary_country || prospectData?.country || fallbackCountry || null;
    const country = rawCountry ? (resolveCountryName(rawCountry) || rawCountry) : null;
    const cityFromAddress = extractCityFromAddressSnapshot(stop.address_snapshot);
    const cityFromEntity = customerData?.city || prospectData?.city || null;
    const city = cleanCityName(stop.stop_city || cityFromAddress || cityFromEntity);
    return { country, city };
  }, [resolveCountryName]);

  const routeGeoSummary = useMemo(() => {
    const countries = [];
    const cities = [];
    const countrySeen = new Set();
    const citySeen = new Set();

    const pushUnique = (arr, seen, value) => {
      const normalized = String(value || '').trim();
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      arr.push(normalized);
    };

    stops.forEach((stop) => {
      const customerData = stop.customer_id && customerMap.has(stop.customer_id)
        ? customerMap.get(stop.customer_id).data
        : null;
      const prospectData = stop.prospect_id && prospectMap.has(stop.prospect_id)
        ? prospectMap.get(stop.prospect_id).data
        : null;

      const { country, city } = resolveStopGeoMeta(stop, customerData, prospectData);
      if (country) pushUnique(countries, countrySeen, country);

      if (city && (!country || String(city).trim().toLowerCase() !== String(country).trim().toLowerCase())) {
        pushUnique(cities, citySeen, city);
      }
    });

    const countriesFinal = countries.some(hasLatinChars) ? countries.filter(hasLatinChars) : countries;
    const citiesFinal = cities.some(hasLatinChars) ? cities.filter(hasLatinChars) : cities;
    return { countries: countriesFinal, cities: citiesFinal };
  }, [stops, customerMap, prospectMap, resolveStopGeoMeta]);

  const draftOptions = useMemo(() => {
    if (draftModalType === 'customers') {
      return filteredCustomers.map(c => {
        const cid = c.customer_id || c.id;
        const loc = [c.city, c.country || c.primary_country].filter(Boolean).join(', ');
        return { value: `c-${cid}`, label: `${c.customer_name || c.display_name || `#${cid}`}${loc ? ` (${loc})` : ''}` };
      });
    }
    return filteredProspects.map(p => {
      const loc = [p.city, p.country].filter(Boolean).join(', ');
      return { value: `p-${p.id}`, label: `${p.customer_name || `Prospect #${p.id}`}${loc ? ` (${loc})` : ''}` };
    });
  }, [draftModalType, filteredCustomers, filteredProspects]);

  /* ---------- map initialization (step 1) ---------- */
  useEffect(() => {
    if (step !== 1 || !mapsLoaded) {
      setMapReady(false);
      return;
    }

    let cancelled = false;
    let map = null;
    const timers = [];

    const destroyMap = () => {
      if (map) {
        window.google.maps.event.clearInstanceListeners(map);
        mapMarkersRef.current.forEach(m => { try { m.setMap(null); } catch (_) {} });
        mapMarkersRef.current = [];
        mapInfoWindowsRef.current.forEach(iw => { try { iw.close(); } catch (_) {} });
        mapInfoWindowsRef.current = [];
        if (mapRouteRef.current) { try { mapRouteRef.current.setMap(null); } catch (_) {} mapRouteRef.current = null; }
      }
      mapInstanceRef.current = null;
      setMapReady(false);
    };

    const initMap = () => {
      if (cancelled) return;
      const el = mapContainerRef.current;
      if (!el) {
        timers.push(setTimeout(initMap, 50));
        return;
      }

      if (mapInstanceRef.current) {
        destroyMap();
      }

      try {
        map = new window.google.maps.Map(el, {
          center: { lat: 24.45, lng: 54.38 },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });
      } catch (_) {
        setMapReady(false);
        return;
      }

      mapInstanceRef.current = map;
      setMapReady(true);

      // Trigger resize after layout settles
      timers.push(setTimeout(() => { if (mapInstanceRef.current) window.google.maps.event.trigger(mapInstanceRef.current, 'resize'); }, 200));
      timers.push(setTimeout(() => { if (mapInstanceRef.current) window.google.maps.event.trigger(mapInstanceRef.current, 'resize'); }, 600));

      map.addListener('click', (e) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        if (pinTargetIdxRef.current !== null) {
          const target = stopsRef.current[pinTargetIdxRef.current];
          const addr = target?.address_snapshot || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          if (applyCoordinatesToStopRef.current) {
            applyCoordinatesToStopRef.current(pinTargetIdxRef.current, lat, lng, addr);
          }
          setPinTargetIdx(null);
          return;
        }
        modalRef.current?.confirm({
          title: 'Add stop at this location?',
          content: `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`,
          onOk: () => {
            setStops(prev => {
              panToStopIdxRef.current = prev.length; // pan to the new stop
              return [...prev, { ...createStop(), stop_type: 'location', duration_mins: 0, latitude: lat, longitude: lng, address_snapshot: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }];
            });
          },
        });
      });
    };

    timers.push(setTimeout(initMap, 0));

    return () => {
      cancelled = true;
      timers.forEach(t => clearTimeout(t));
      destroyMap();
    };
  }, [step, mapsLoaded]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const fsEl = document.fullscreenElement;
      const active = Boolean(fsEl && mapCardWrapRef.current && fsEl === mapCardWrapRef.current);
      setIsMapFullscreen(active);
      setTimeout(() => {
        if (mapInstanceRef.current) window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
      }, 50);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Update map markers when stops change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear old markers
    mapMarkersRef.current.forEach(m => m.setMap(null));
    mapMarkersRef.current = [];
    mapInfoWindowsRef.current.forEach(iw => iw.close());
    mapInfoWindowsRef.current = [];

    // Remove old route
    if (mapRouteRef.current) { mapRouteRef.current.setMap(null); mapRouteRef.current = null; }

    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    stops.forEach((s, idx) => {
      const lat = Number(s.latitude), lng = Number(s.longitude);
      if (!hasValidCoordinates(lat, lng)) return;
      const color = STOP_COLORS[s.stop_type] || STOP_COLORS.other;

      const svgNum = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="14" fill="${color}" stroke="white" stroke-width="2"/>
          <text x="15" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="Arial">${idx + 1}</text>
        </svg>`
      );

      const name = s.customer_id && customerMap.has(s.customer_id) ? customerMap.get(s.customer_id).label
        : s.prospect_id && prospectMap.has(s.prospect_id) ? prospectMap.get(s.prospect_id).label
        : s.address_snapshot || `Stop ${idx + 1}`;

      const marker = new window.google.maps.Marker({
        position: { lat, lng },
        map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${svgNum}`,
          scaledSize: new window.google.maps.Size(30, 30),
          anchor: new window.google.maps.Point(15, 15),
        },
        title: name,
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `<b>#${idx + 1}</b> ${(name || '').replace(/</g, '&lt;')}`,
      });
      marker.addListener('click', () => infoWindow.open({ anchor: marker, map }));

      mapMarkersRef.current.push(marker);
      mapInfoWindowsRef.current.push(infoWindow);
      bounds.extend({ lat, lng });
      hasPoints = true;
    });

    if (hasPoints && stops.filter(s => hasValidCoordinates(s.latitude, s.longitude)).length >= 2) {
      // Build country segments for per-segment routing
      const geoStops = stops.filter(s => hasValidCoordinates(s.latitude, s.longitude));
      const segments = []; // [{stops: [...], crossCountry: bool}]
      let currentSegment = [geoStops[0]];
      for (let i = 1; i < geoStops.length; i++) {
        const cross = isCrossCountry(geoStops[i - 1], geoStops[i]);
        if (cross) {
          // End current segment, add a cross-country connector, start new segment
          if (currentSegment.length > 0) segments.push({ stops: currentSegment, crossCountry: false });
          segments.push({ stops: [geoStops[i - 1], geoStops[i]], crossCountry: true });
          currentSegment = [geoStops[i]];
        } else {
          currentSegment.push(geoStops[i]);
        }
      }
      if (currentSegment.length > 0) segments.push({ stops: currentSegment, crossCountry: false });

      // Draw each segment
      const polylines = [];
      const seq = ++mapRouteReqSeqRef.current;

      segments.forEach(segment => {
        const path = segment.stops.map(s => ({ lat: Number(s.latitude), lng: Number(s.longitude) }));
        if (segment.crossCountry) {
          const isFlightSeg = segment.stops[0]?.transport_to_next === 'flight';
          if (isFlightSeg) {
            // Geodesic curved arc for flight (looks like a real flight path on map)
            polylines.push(new window.google.maps.Polyline({
              path,
              map,
              strokeColor: '#1677ff',
              strokeWeight: 2,
              strokeOpacity: 0,
              geodesic: true,
              icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, strokeColor: '#1677ff', scale: 3 }, offset: '0', repeat: '14px' }],
            }));
            // Plane icon at midpoint — bearing-aware so the arrow points in flight direction
            const midLat = (path[0].lat + path[path.length - 1].lat) / 2;
            const midLng = (path[0].lng + path[path.length - 1].lng) / 2;
            const toRad = d => d * Math.PI / 180;
            const lat1 = toRad(path[0].lat);
            const lat2 = toRad(path[path.length - 1].lat);
            const dLng   = toRad(path[path.length - 1].lng - path[0].lng);
            const dy = Math.sin(dLng) * Math.cos(lat2);
            const dx = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
            const bearing = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
            const planeMarker = new window.google.maps.Marker({
              position: { lat: midLat, lng: midLng },
              map,
              icon: {
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 6,
                fillColor: '#1677ff',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                rotation: bearing, // degrees clockwise from north — matches bearing exactly
              },
              title: '✈ Flight segment',
              zIndex: 5,
            });
            mapMarkersRef.current.push(planeMarker);
          } else {
            // Dashed orange line for other transit
            polylines.push(new window.google.maps.Polyline({
              path,
              map,
              strokeColor: '#faad14',
              strokeWeight: 2,
              strokeOpacity: 0,
              icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.7, strokeColor: '#faad14', scale: 3 }, offset: '0', repeat: '12px' }],
            }));
          }
        } else if (segment.stops.length >= 2) {
          // Try to get routed path for within-country driving
          const coordinates = segment.stops.map(s => `${Number(s.longitude)},${Number(s.latitude)}`).join(';');
          axios.get(`${API_BASE}/api/crm/field-trips/route-geometry`, {
            headers: getAuthHeaders(),
            params: { coordinates },
          }).then((res) => {
            if (seq !== mapRouteReqSeqRef.current || !mapInstanceRef.current) return;
            const routedLatLngs = res.data?.data?.latlngs;
            if (Array.isArray(routedLatLngs) && routedLatLngs.length >= 2) {
              polylines.push(new window.google.maps.Polyline({
                path: routedLatLngs.map(([lat, lng]) => ({ lat, lng })),
                map,
                strokeColor: '#1677ff',
                strokeWeight: 3,
                strokeOpacity: 0.75,
              }));
            } else {
              polylines.push(new window.google.maps.Polyline({ path, map, strokeColor: '#1677ff', strokeWeight: 3, strokeOpacity: 0.65 }));
            }
          }).catch(() => {
            if (seq !== mapRouteReqSeqRef.current || !mapInstanceRef.current) return;
            polylines.push(new window.google.maps.Polyline({ path, map, strokeColor: '#1677ff', strokeWeight: 3, strokeOpacity: 0.65 }));
          });
        }
      });

      // Store all polylines for cleanup
      mapRouteRef.current = { setMap: (m) => polylines.forEach(p => p.setMap(m)) };
    }

    if (hasPoints) {
      // If a specific stop was flagged for pan (newly added/geocoded), pan to it
      const panIdx = panToStopIdxRef.current;
      panToStopIdxRef.current = null;
      const panStop = panIdx !== null ? stops[panIdx] : null;
      if (panStop && hasValidCoordinates(panStop.latitude, panStop.longitude)) {
        map.panTo({ lat: Number(panStop.latitude), lng: Number(panStop.longitude) });
        map.setZoom(13);
      } else {
        const validStops = stops.filter(s => hasValidCoordinates(s.latitude, s.longitude));
        if (validStops.length === 1) {
          map.panTo({ lat: Number(validStops[0].latitude), lng: Number(validStops[0].longitude) });
          map.setZoom(13);
        } else {
          map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
          const listener = window.google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
            if (map.getZoom() > 13) map.setZoom(13);
          });
          setTimeout(() => window.google.maps.event.removeListener(listener), 2000);
        }
      }
    }
  }, [stops, mapReady, customerMap, prospectMap]);

  // If no stop coordinates exist yet, center by selected country so user sees the planning region first.
  useEffect(() => {
    if (step !== 1 || !mapReady || !mapInstanceRef.current) return;
    const hasGeoStops = stops.some(s => hasValidCoordinates(s.latitude, s.longitude));
    if (hasGeoStops) return;

    // For international trips, center on the first destination country; for local, use the departure country
    let countryName = '';
    if (tripType === 'international' && savedDestinations?.length > 0) {
      const destRow = countries.find(c => c.country_code_2 === savedDestinations[0]);
      countryName = destRow ? destRow.country_name : savedDestinations[0];
    } else {
      const countryRow = countries.find(c => c.country_code_2 === selectedCountryCode);
      countryName = countryRow?.country_name || (tripType === 'local' ? 'United Arab Emirates' : '');
    }
    if (!countryName) return;

    let cancelled = false;
    const setCenter = (lat, lng, zoom) => {
      if (cancelled || !mapInstanceRef.current) return;
      mapInstanceRef.current.panTo({ lat, lng });
      mapInstanceRef.current.setZoom(zoom);
    };

    axios.get(`${API_BASE}/api/crm/field-trips/geocode`, {
      headers: getAuthHeaders(),
      params: { address: countryName },
    }).then((res) => {
      const best = (res.data?.data || [])[0];
      const lat = Number(best?.lat);
      const lng = Number(best?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        // Zoom level: local trips zoom in tight on the country, international shows wider view
        const zoomLevel = tripType === 'local' ? 6 : 4;
        setCenter(lat, lng, zoomLevel);
      }
    }).catch(() => { /* non-blocking */ });

    return () => { cancelled = true; };
  }, [step, mapReady, stops, countries, selectedCountryCode, tripType, savedDestinations]);

  // Clean stale coords on blank placeholder rows so map does not jump to invalid points.
  useEffect(() => {
    if (step !== 1) return;
    setStops((prev) => prev.map((s) => {
      const hasEntity = Boolean(s.customer_id || s.prospect_id);
      const hasAddress = Boolean((s.address_snapshot || '').trim());
      if (hasEntity || hasAddress) return s;
      if (!hasValidCoordinates(s.latitude, s.longitude)) return s;
      return { ...s, latitude: null, longitude: null };
    }));
  }, [step]);

  // Warn user before leaving if stops exist (prevent accidental data loss)
  useEffect(() => {
    const handler = (e) => {
      if (stops.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [stops.length]);

  /* ---------- save trip (explicit user action only) ---------- */
  const autoSaveRef = useRef(false); // prevent concurrent saves
  const autoSaveFnRef = useRef(null);
  const autoSaveDebounceRef = useRef(null);

  const buildTripPayload = useCallback(() => {
    // form.getFieldsValue may be empty on steps 1/2 (Form unmounts), so merge with snapshot
    const liveVals = form.getFieldsValue(true) || {};
    if (Object.keys(liveVals).length > 1) {
      // Update snapshot with live values when form is mounted
      Object.assign(formSnapshotRef.current, liveVals);
    }
    const vals = { ...formSnapshotRef.current, ...liveVals };
    const countryRow = countries.find(c => c.country_code_2 === (vals.country_code || plannerCountryCode));
    return {
      title: vals.title || 'Untitled Trip',
      country: countryRow?.country_name || vals.country_code || null,
      country_code: vals.country_code || plannerCountryCode || null,
      trip_type: vals.trip_type || 'local',
      transport_mode: serializeTransportMode(vals.transport_mode),
      budget_estimate: vals.budget_estimate || null,
      accommodation: vals.accommodation || null,
      visa_required: vals.visa_required || false,
      destination_countries: vals.destination_countries || [],
      ...(selectedRepId ? { rep_id: selectedRepId } : {}),
      cities: routeGeoSummary.cities,
      departure_date: vals.departure_date ? dayjs(vals.departure_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      return_date: vals.return_date ? dayjs(vals.return_date).format('YYYY-MM-DD') : dayjs().add(1, 'day').format('YYYY-MM-DD'),
      travel_notes: vals.travel_notes || null,
      objectives: vals.objectives || null,
      visa_details: vals.visa_required ? { visa_type: vals.visa_type || null } : null,
      predeparture_checklist: checklist,
      legs,
      stops: stops.map((s, idx) => {
        const { local_id, ...rest } = s;
        return { ...rest, stop_order: idx + 1, visit_date: s.visit_date ? dayjs(s.visit_date).format('YYYY-MM-DD') : null };
      }),
    };
  }, [form, countries, selectedRepId, checklist, legs, stops, plannerCountryCode, routeGeoSummary.cities]);

  const autoSaveTrip = useCallback(async () => {
    if (autoSaveRef.current) return; // already saving
    autoSaveRef.current = true;
    setAutoSaveStatus('saving');
    try {
      const payload = buildTripPayload();
      const currentId = editingTripIdRef.current;
      if (currentId) {
        // Update existing trip
        await axios.put(`${API_BASE}/api/crm/field-trips/${currentId}/full`, payload, { headers: getAuthHeaders() });
      } else {
        // Create new draft trip
        payload.status = 'draft';
        const res = await axios.post(`${API_BASE}/api/crm/field-trips`, payload, { headers: getAuthHeaders() });
        const newId = res.data?.data?.id;
        if (newId) setEditingTripId(newId);
      }
      setAutoSaveStatus('saved');
      setLastAutoSaveTime(new Date());
    } catch (err) {
      setAutoSaveStatus('error');
      const errMsg = err?.response?.data?.error || err.message;
      console.error('[Save failed]', errMsg, err?.response?.status, err?.response?.data);
    } finally {
      autoSaveRef.current = false;
    }
  }, [buildTripPayload]);

  // Trips are saved only when the user explicitly clicks Save Draft or Next/Save Trip.

  // Resume a trip: load its full data into the planner for continued editing
  const resumeTrip = async (tripId) => {
    try {
      const res = await axios.get(`${API_BASE}/api/crm/field-trips/${tripId}`, { headers: getAuthHeaders() });
      const trip = res.data?.data;
      if (!trip) { message.error('Trip not found'); return; }

      const destCountries = trip.destination_countries
        ? (Array.isArray(trip.destination_countries) ? trip.destination_countries : JSON.parse(trip.destination_countries))
        : [];

      const visaDetails = trip.visa_details
        ? (typeof trip.visa_details === 'string' ? JSON.parse(trip.visa_details) : trip.visa_details)
        : {};
      const loadedVals = {
        title: trip.title || undefined,
        trip_type: trip.trip_type || 'local',
        country_code: trip.country_code || 'AE',
        destination_countries: destCountries,
        transport_mode: parseTransportMode(trip.transport_mode),
        budget_estimate: trip.budget_estimate || undefined,
        visa_required: trip.visa_required || false,
        visa_type: visaDetails.visa_type || undefined,
        accommodation: trip.accommodation || undefined,
        objectives: trip.objectives || undefined,
        travel_notes: trip.travel_notes || undefined,
        departure_date: trip.departure_date ? dayjs(trip.departure_date) : undefined,
        return_date: trip.return_date ? dayjs(trip.return_date) : undefined,
      };
      form.setFieldsValue(loadedVals);
      formSnapshotRef.current = { ...formSnapshotRef.current, ...loadedVals };
      if (trip.country_code) setPlannerCountryCode(trip.country_code);
      setSavedTripType(trip.trip_type || 'local');
      setSavedDestinations(destCountries);
      if (trip.departure_date) setSavedDeparture(dayjs(trip.departure_date).format('YYYY-MM-DD'));
      if (trip.return_date) setSavedReturn(dayjs(trip.return_date).format('YYYY-MM-DD'));

      // Load stops — keep dates, locations & contacts
      const newStops = (trip.stops || []).map(s => ({
        ...createStop(),
        stop_type: s.stop_type || 'customer',
        customer_id: s.customer_id || null,
        prospect_id: s.prospect_id || null,
        stop_city: cleanCityName(s.stop_city || s.customer_city || null),
        stop_country: resolveCountryName(s.stop_country) || s.stop_country || null,
        latitude: s.latitude || null,
        longitude: s.longitude || null,
        address_snapshot: s.address_snapshot || '',
        objectives: s.objectives || '',
        contact_person: s.contact_person || '',
        contact_phone: s.contact_phone || '',
        contact_email: s.contact_email || '',
        duration_mins: s.duration_mins ?? 60,
        custom_label: s.custom_label || null,
        transport_to_next: s.transport_to_next || null,
        visit_date: s.visit_date || null,
        visit_time: s.visit_time || null,
        coordinates_persist_status: hasValidCoordinates(s.latitude, s.longitude) ? 'saved' : null,
        local_id: crypto.randomUUID(),
      }));
      setStops(newStops.length ? newStops : []);

      // Load legs
      const newLegs = (trip.legs || []).map(l => ({ ...l, id: undefined, trip_id: undefined }));
      if (newLegs.length) setLegs(newLegs);

      // Load checklist
      if (trip.predeparture_checklist?.length) {
        setChecklist(trip.predeparture_checklist);
      }

      setEditingTripId(tripId);
      setShowPrevTripsModal(false);
      message.success('Trip loaded — continue editing.');
    } catch {
      message.error('Failed to load trip details');
    }
  };

  // Allow direct resume/edit via /crm/visits/:id/edit
  useEffect(() => {
    if (!routeTripId) {
      loadedRouteTripIdRef.current = null;
      return;
    }
    if (loadingLookups) return;
    const numericTripId = Number(routeTripId);
    if (!Number.isFinite(numericTripId) || numericTripId <= 0) return;
    if (loadedRouteTripIdRef.current === numericTripId) return;

    loadedRouteTripIdRef.current = numericTripId;
    editingTripIdRef.current = numericTripId;
    resumeTrip(numericTripId);
    // resumeTrip intentionally omitted to avoid rerunning on each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeTripId, loadingLookups]);

  // On /crm/visits/new, warn if the user already has unfinished draft/planning trips
  useEffect(() => {
    if (routeTripId) return; // editing an existing trip — no banner needed
    axios.get(`${API_BASE}/api/crm/field-trips`, {
      headers: getAuthHeaders(),
      params: { limit: 20 },
    }).then(res => {
      const trips = res.data?.data || [];
      const count = trips.filter(t => t.status === 'draft' || t.status === 'planning').length;
      if (count > 0) setExistingDraftsCount(count);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeTripId]);


  /* ---------- stop helpers ---------- */
  const updateStop = (index, patch) => {
    setStops(prev => {
      const updated = prev.map((s, i) => i === index ? { ...s, ...patch } : s);
      // Auto-sort by time within same-date groups when date or time changes
      if ('visit_date' in patch || 'visit_time' in patch) {
        const target = updated[index];
        const targetDate = target.visit_date || '';
        const targetCountry = (target.stop_country || '').trim().toLowerCase();
        // Only sort if the changed stop has a date
        if (targetDate) {
          // Find contiguous block of same-date + same-country stops
          let blockStart = index, blockEnd = index;
          while (blockStart > 0) {
            const s = updated[blockStart - 1];
            if ((s.visit_date || '') === targetDate && (s.stop_country || '').trim().toLowerCase() === targetCountry) blockStart--;
            else break;
          }
          while (blockEnd < updated.length - 1) {
            const s = updated[blockEnd + 1];
            if ((s.visit_date || '') === targetDate && (s.stop_country || '').trim().toLowerCase() === targetCountry) blockEnd++;
            else break;
          }
          if (blockEnd > blockStart) {
            const block = updated.slice(blockStart, blockEnd + 1);
            const parseT = (t) => { if (!t) return Infinity; const p = t.split(':').map(Number); return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0); };
            block.sort((a, b) => parseT(a.visit_time) - parseT(b.visit_time));
            for (let i = 0; i < block.length; i++) updated[blockStart + i] = block[i];
          }
        }
      }
      return updated;
    });
  };
  const removeStop = (index) => setStops(prev => prev.filter((_, i) => i !== index));

  // Insert a location stop (hotel, waypoint, etc.) after a given index
  const insertCustomStopAfter = (afterIdx) => {
    const prevStop = stops[afterIdx];
    const nextStop = stops[afterIdx + 1];
    // Inherit country from the next stop (the destination) or the previous stop
    const inheritCountry = nextStop?.stop_country || prevStop?.stop_country || null;
    const inheritDate = nextStop?.visit_date || prevStop?.visit_date || null;
    setStops(prev => {
      const newStop = { ...createStop(), stop_type: 'location', duration_mins: 0, stop_country: inheritCountry, visit_date: inheritDate };
      const next = [...prev];
      next.splice(afterIdx + 1, 0, newStop);
      return next;
    });
    message.info('Location stop inserted — search for an address or use the map.');
  };

  const onDragEnd = (result) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    setStops(prev => {
      const next = [...prev];
      const [moved] = next.splice(result.source.index, 1);
      next.splice(result.destination.index, 0, moved);
      return next;
    });
  };

  const moveStop = (idx, direction) => {
    setStops(prev => {
      const next = [...prev];
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const discardOptimizedPreview = useCallback(() => {
    if (!optimizePreviewPending || !preOptimizationStopsRef.current) return;
    setStops(preOptimizationStopsRef.current);
    preOptimizationStopsRef.current = null;
    setOptimizePreviewPending(false);
    message.info('Optimization discarded.');
  }, [optimizePreviewPending, message]);

  const acceptOptimizedPreview = useCallback(() => {
    if (!optimizePreviewPending) return;
    preOptimizationStopsRef.current = null;
    setOptimizePreviewPending(false);
    message.success('Optimized route accepted.');
  }, [optimizePreviewPending, message]);

  /* ---------- optimize route ---------- */
  const optimizeRoute = () => {
    if (optimizePreviewPending) {
      message.warning('Please Accept or Discard the current optimization preview first.');
      return;
    }
    if (stops.length < 2) { message.info('Add at least 2 stops to optimize.'); return; }
    const runOptimize = () => {
      const preOptimizedStops = [...stops];
      const dist = (a, b) => Math.sqrt((a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2);
      const hasCoord = s => hasValidCoordinates(s.latitude, s.longitude);
      const optimizeGroup = (arr) => {
        if (arr.length < 2) return arr;
        const remaining = [...arr];
        const ordered = [remaining.shift()];
        while (remaining.length) {
          const cur = ordered[ordered.length - 1];
          let bestIdx = 0, best = Infinity;
          let anyDistanceComputed = false;
          remaining.forEach((c, i) => {
            if (!hasCoord(cur) || !hasCoord(c)) return;
            const d = dist({ lat: Number(cur.latitude), lng: Number(cur.longitude) }, { lat: Number(c.latitude), lng: Number(c.longitude) });
            anyDistanceComputed = true;
            if (d < best) { best = d; bestIdx = i; }
          });
          if (!anyDistanceComputed) bestIdx = 0;
          ordered.push(remaining.splice(bestIdx, 1)[0]);
        }
        return ordered;
      };

      // Group by country first (preserving trip country order), then by date within each country
      const countryOrder = tripCountryNames.map(n => n.toLowerCase());
      const countryGroups = new Map();
      stops.forEach(s => {
        const sc = String(s.stop_country || '').trim().toLowerCase();
        // Find the matching trip country (fuzzy)
        const matched = countryOrder.find(cn => cn === sc || cn.includes(sc) || sc.includes(cn)) || sc || '__unknown__';
        if (!countryGroups.has(matched)) countryGroups.set(matched, []);
        countryGroups.get(matched).push(s);
      });

      const all = [];
      // Process in trip country order
      countryOrder.forEach(cn => {
        const countryStops = countryGroups.get(cn) || [];
        if (countryStops.length === 0) return;
        countryGroups.delete(cn);
        // Within each country, group by date
        const dateGroups = new Map();
        countryStops.forEach(s => {
          const key = s.visit_date || '__undated__';
          if (!dateGroups.has(key)) dateGroups.set(key, []);
          dateGroups.get(key).push(s);
        });
        const dated = [...dateGroups.keys()].filter(k => k !== '__undated__').sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf());
        dated.forEach(k => all.push(...optimizeGroup(dateGroups.get(k))));
        if (dateGroups.has('__undated__')) all.push(...optimizeGroup(dateGroups.get('__undated__')));
      });
      // Any stops with unmatched countries go at the end
      for (const [, countryStops] of countryGroups) {
        all.push(...optimizeGroup(countryStops));
      }

      const prevSig = preOptimizedStops.map(s => s.id || s.local_id || `${s.customer_id || ''}-${s.prospect_id || ''}-${s.address_snapshot || ''}`).join('|');
      const nextSig = all.map(s => s.id || s.local_id || `${s.customer_id || ''}-${s.prospect_id || ''}-${s.address_snapshot || ''}`).join('|');
      if (prevSig === nextSig) {
        message.info('Route is already optimized for current stop set.');
        return;
      }

      preOptimizationStopsRef.current = preOptimizedStops;
      setStops(all);
      setOptimizePreviewPending(true);
      message.info('Optimization preview applied. Please Accept or Discard.');
    };

    const missingCoordsCount = stops.filter(s => !hasValidCoordinates(s.latitude, s.longitude)).length;
    if (missingCoordsCount > 0) {
      modal.confirm({
        title: 'Optimize route with missing locations?',
        content: `${missingCoordsCount} stop(s) have no valid coordinates. They will keep relative order where distance cannot be computed. Continue?`,
        okText: 'Optimize Anyway',
        cancelText: 'Cancel',
        onOk: runOptimize,
      });
      return;
    }

    modal.confirm({
      title: 'Optimize route?',
      content: 'This will reorder current stops using nearest-neighbor logic by country and day.',
      okText: 'Optimize',
      cancelText: 'Cancel',
      onOk: runOptimize,
    });
  };

  /* ---------- auto-detect airport-to-airport → flight ---------- */
  useEffect(() => {
    const hasUnset = stops.some((s, idx) =>
      idx < stops.length - 1 &&
      s.custom_label === 'airport' &&
      stops[idx + 1]?.custom_label === 'airport' &&
      !s.transport_to_next
    );
    if (!hasUnset) return;
    setStops(prev => prev.map((s, idx) => {
      if (idx >= prev.length - 1) return s;
      const next = prev[idx + 1];
      if (s.custom_label === 'airport' && next?.custom_label === 'airport' && !s.transport_to_next) {
        return { ...s, transport_to_next: 'flight' };
      }
      return s;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  /* ---------- route intelligence: fetch drive distances / times ---------- */
  // Detect if two consecutive stops are in different countries
  const isCrossCountry = useCallback((a, b) => {
    if (!a?.stop_country || !b?.stop_country) return false;
    const ac = String(a.stop_country).trim().toLowerCase();
    const bc = String(b.stop_country).trim().toLowerCase();
    return ac !== bc && !ac.includes(bc) && !bc.includes(ac);
  }, []);

  // Find the best matching transit leg from FieldVisitLegForm for a cross-country pair
  const findTransitLeg = useCallback((fromStop, toStop) => {
    if (!legs.length) return null;
    // Try to match by country names in from_label/to_label or dep_airport/arr_airport
    const fromCountry = String(fromStop.stop_country || '').toLowerCase();
    const toCountry = String(toStop.stop_country || '').toLowerCase();
    return legs.find(l => {
      const from = [l.from_label, l.dep_airport].join(' ').toLowerCase();
      const to = [l.to_label, l.arr_airport].join(' ').toLowerCase();
      // Best effort: see if the from field relates to fromCountry and to field relates to toCountry
      return (from.includes(fromCountry) || fromCountry.includes(from.split(' ')[0])) &&
             (to.includes(toCountry) || toCountry.includes(to.split(' ')[0]));
    }) || null;
  }, [legs]);

  const fetchRouteLegs = useCallback((stopsArr) => {
    if (stopsArr.length < 2) { setRouteLegs([]); return; }
    const ds = directionsServiceRef.current;
    if (!ds || !window.google?.maps?.TravelMode) return;

    const seq = ++routeFetchSeqRef.current;

    // Promisified single-leg DirectionsService call
    const getOneLeg = (a, b) => new Promise((resolve) => {
      if (!hasValidCoordinates(a.latitude, a.longitude) || !hasValidCoordinates(b.latitude, b.longitude)) {
        resolve({ noCoords: true });
        return;
      }
      ds.route({
        origin: { lat: Number(a.latitude), lng: Number(a.longitude) },
        destination: { lat: Number(b.latitude), lng: Number(b.longitude) },
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status !== 'OK' || !result?.routes?.[0]?.legs?.[0]) {
          resolve({ error: true });
          return;
        }
        const l = result.routes[0].legs[0];
        resolve({
          distanceM: l.distance?.value ?? null,
          distanceTxt: l.distance?.text ?? null,
          durationSec: l.duration?.value ?? null,
          durationTxt: l.duration?.text ?? null,
          error: false,
        });
      });
    });

    setRouteLegsLoading(true);
    Promise.all(stopsArr.slice(0, -1).map((s, i) => {
      const next = stopsArr[i + 1];
      // Cross-country: don't call Google Directions — use transit leg data
      if (isCrossCountry(s, next)) {
        const tl = findTransitLeg(s, next);
        let durationSec = null;
        if (tl?.dep_datetime && tl?.arr_datetime) {
          durationSec = Math.round((new Date(tl.arr_datetime) - new Date(tl.dep_datetime)) / 1000);
          if (durationSec < 0) durationSec = null;
        }
        return Promise.resolve({ transit: true, crossCountry: true, transitLeg: tl, durationSec, error: false });
      }
      return getOneLeg(s, next);
    }))
      .then((resultLegs) => {
        if (seq !== routeFetchSeqRef.current) return; // discard stale response
        // Mark cross-country legs without transit data
        const enriched = resultLegs.map((leg, i) => {
          if (isCrossCountry(stopsArr[i], stopsArr[i + 1]) && !leg.transit) {
            return { crossCountry: true, error: false };
          }
          return leg;
        });
        setRouteLegs(enriched);
      })
      .catch(() => {
        if (seq !== routeFetchSeqRef.current) return;
        setRouteLegs(stopsArr.slice(0, -1).map(() => ({ error: true })));
      })
      .finally(() => {
        if (seq === routeFetchSeqRef.current) setRouteLegsLoading(false);
      });
  }, [isCrossCountry, findTransitLeg]);

  // Re-fetch legs whenever stop coordinates change (debounced 800 ms)
  const stopsCoordsSig = useMemo(
    () => stops.map(s => `${s.latitude ?? ''},${s.longitude ?? ''}`).join('|'),
    [stops]
  );
  useEffect(() => {
    if (!mapReady || stops.length < 2) { setRouteLegs([]); return; }
    const t = setTimeout(() => fetchRouteLegs(stops), 800);
    return () => clearTimeout(t);
  // fetchRouteLegs is stable (empty dep array), stopsCoordsSig drives recalc
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsCoordsSig, mapReady]);

  /* ---------- draft stops from selection ---------- */
  const addDraftStops = () => {
    if (!draftSelection.length) { message.warning('Select at least one record.'); return; }
    const custMap = new Map(customers.map(c => [String(c.customer_id || c.id), c]));
    const prospMap = new Map(prospects.map(p => [String(p.id), p]));

    // Build created array outside setStops so it is accessible for the notification
    const created = [];
    const geocodeHints = [];
    const existCustIdsSnapshot = new Set(stops.filter(s => s.customer_id).map(s => String(s.customer_id)));
    const existProspIdsSnapshot = new Set(stops.filter(s => s.prospect_id).map(s => String(s.prospect_id)));
    draftSelection.forEach((raw) => {
      const [prefix, id] = String(raw).split('-');
      if (prefix === 'c' && custMap.has(id)) {
        if (existCustIdsSnapshot.has(id)) return;
        existCustIdsSnapshot.add(id);
        const c = custMap.get(id);
        const lat = hasValidCoordinates(c.latitude, c.longitude) ? c.latitude : null;
        const lng = hasValidCoordinates(c.latitude, c.longitude) ? c.longitude : null;
        created.push({
          ...createStop(),
          stop_type: 'customer',
          customer_id: Number(id),
          stop_country: resolveCountryName(draftCountryFilter || c.country || c.primary_country) || null,
          latitude: lat,
          longitude: lng,
          coordinates_persist_status: hasValidCoordinates(lat, lng) ? 'saved' : null,
          address_snapshot: [c.city, resolveCountryName(c.country || c.primary_country) || c.country || c.primary_country].filter(Boolean).join(', '),
        });
        geocodeHints.push([c.customer_name || c.display_name, c.city, c.country || c.primary_country].filter(Boolean));
        return;
      }
      if (prefix === 'p' && prospMap.has(id)) {
        if (existProspIdsSnapshot.has(id)) return;
        existProspIdsSnapshot.add(id);
        const p = prospMap.get(id);
        const lat = hasValidCoordinates(p.latitude, p.longitude) ? p.latitude : null;
        const lng = hasValidCoordinates(p.latitude, p.longitude) ? p.longitude : null;
        created.push({
          ...createStop(),
          stop_type: 'prospect',
          prospect_id: Number(id),
          stop_country: resolveCountryName(draftCountryFilter || p.country) || null,
          latitude: lat,
          longitude: lng,
          coordinates_persist_status: hasValidCoordinates(lat, lng) ? 'saved' : null,
          address_snapshot: [p.city, resolveCountryName(p.country) || p.country].filter(Boolean).join(', '),
        });
        geocodeHints.push([p.customer_name, p.city, p.country].filter(Boolean));
      }
    });

    if (created.length === 0) {
      message.info('All selected records are already added as stops.');
      setDraftModalType(null);
      setDraftSelection([]);
      return;
    }

    let queuedGeocodeTasks = [];
    setStops(prev => {
      const isPlaceholder = prev.length === 1 && !prev[0].customer_id && !prev[0].prospect_id && !prev[0].address_snapshot && !prev[0].objectives;
      const newStops = [...(isPlaceholder ? [] : prev), ...created];

      // Pan map to the last added stop
      panToStopIdxRef.current = newStops.length - 1;

      // Auto-geocode stops that lack coordinates OR share duplicated placeholder coordinates.
      const coordCounts = new Map();
      newStops.forEach((s) => {
        if (!hasValidCoordinates(s.latitude, s.longitude)) return;
        const key = `${Number(s.latitude).toFixed(4)},${Number(s.longitude).toFixed(4)}`;
        coordCounts.set(key, (coordCounts.get(key) || 0) + 1);
      });

      const offset = isPlaceholder ? 0 : prev.length;
      // Queue auto-geocode outside setState to avoid nested state updates
      const geocodeQueue = [];
      created.forEach((s, i) => {
        const hasCoord = hasValidCoordinates(s.latitude, s.longitude);
        const key = hasCoord ? `${Number(s.latitude).toFixed(4)},${Number(s.longitude).toFixed(4)}` : null;
        const isDuplicateCoord = key ? (coordCounts.get(key) || 0) > 1 : false;
        if ((!hasCoord || isDuplicateCoord) && geocodeHints[i]?.length) {
          const stopCountryName = s.stop_country || null;
          const stopCountryCode = stopCountryName
            ? (countries.find(c => c.country_name === stopCountryName || c.country_code_2 === stopCountryName)?.country_code_2 || null)
            : null;
          geocodeQueue.push({ idx: offset + i, hints: geocodeHints[i], countryCode: stopCountryCode });
        }
      });
      queuedGeocodeTasks = geocodeQueue;
      return newStops;
    });
    if (queuedGeocodeTasks.length > 0) {
      setTimeout(() => queuedGeocodeTasks.forEach(q => autoGeocodeStop(q.idx, q.hints, q.countryCode)), 0);
    }

    setDraftModalType(null);
    setDraftSelection([]);

    // Notify user about stops that need location pinning
    const noLocCount = created.filter(
      s => (s.customer_id || s.prospect_id) && !hasValidCoordinates(s.latitude, s.longitude)
    ).length;
    if (noLocCount > 0) {
      message.warning({
        content: `${created.length} stop(s) added. ${noLocCount} have no saved location — use "Pin On Map" or "Paste Google Maps Link" on each highlighted stop.`,
        duration: 6,
      });
    } else {
      message.success('Draft stops added.');
    }
  };

  /* ---------- new prospect inline ---------- */
  const handleCreateProspect = async () => {
    try {
      const vals = await prospectForm.validateFields();
      setSavingProspect(true);
      const res = await axios.post(`${API_BASE}/api/crm/prospects`, {
        customer_name: vals.customer_name,
        country: vals.country,
        city: vals.city || null,
        notes: vals.notes || null,
        ...(selectedRepId ? { rep_id: selectedRepId } : {}),
      }, { headers: getAuthHeaders() });
      const newP = res.data?.prospect || res.data?.data;
      if (newP) {
        const lat = hasValidCoordinates(newP.latitude, newP.longitude) ? newP.latitude : null;
        const lng = hasValidCoordinates(newP.latitude, newP.longitude) ? newP.longitude : null;
        setProspects(prev => [...prev, newP]);
        const shouldAutoGeocodeNewLead = !hasValidCoordinates(lat, lng);
        const newLeadCountryCode = countries.find(c => c.country_name === newP.country || c.country_code_2 === newP.country)?.country_code_2 || null;
        let insertIndex = 0;
        setStops(prev => {
          insertIndex = prev.length;
          const next = [...prev, {
            ...createStop(),
            stop_type: 'prospect',
            prospect_id: newP.id,
            latitude: lat,
            longitude: lng,
            coordinates_persist_status: hasValidCoordinates(lat, lng) ? 'saved' : null,
            address_snapshot: [newP.city, newP.country].filter(Boolean).join(', '),
          }];
          return next;
        });
        if (shouldAutoGeocodeNewLead) {
          setTimeout(() => autoGeocodeStop(insertIndex, [newP.customer_name, newP.city, newP.country].filter(Boolean), newLeadCountryCode), 0);
        }
        message.success(`Lead "${vals.customer_name}" created and added as stop.`);
      }
      setShowNewProspect(false);
      prospectForm.resetFields();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to create prospect.');
    } finally {
      setSavingProspect(false);
    }
  };

  /* ---------- load pre-visit brief ---------- */
  const loadPreVisitBrief = useCallback(async (stop, index) => {
    const key = stop.id || stop.local_id || `tmp-${index}`;
    setBriefLoadingByStop(prev => ({ ...prev, [key]: true }));
    try {
      if (stop.customer_id) {
        const [detailRes, salesRes, dealsRes] = await Promise.allSettled([
          axios.get(`${API_BASE}/api/crm/customers/${stop.customer_id}`, { headers: getAuthHeaders() }),
          axios.get(`${API_BASE}/api/crm/customers/${stop.customer_id}/sales-history`, { headers: getAuthHeaders() }),
          axios.get(`${API_BASE}/api/crm/deals`, { headers: getAuthHeaders(), params: { customerId: stop.customer_id, status: 'active' } }),
        ]);
        const detail = detailRes.status === 'fulfilled' ? detailRes.value?.data?.data : null;
        const sales = salesRes.status === 'fulfilled' ? salesRes.value?.data?.data : null;
        const deals = dealsRes.status === 'fulfilled' ? dealsRes.value?.data?.data : [];
        const orders = Array.isArray(sales?.transactions) ? sales.transactions.slice(0, 4) : [];
        setBriefByStop(prev => ({ ...prev, [key]: { type: 'Customer', name: detail?.display_name || `Customer #${stop.customer_id}`, country: detail?.primary_country, orders, deals: Array.isArray(deals) ? deals.length : 0, note: detail?.latest_meeting_note || detail?.latest_activity_note } }));
      } else if (stop.prospect_id) {
        let p = (prospects || []).find(pr => Number(pr.id) === Number(stop.prospect_id));
        if (!p) {
          const prospRes = await axios.get(`${API_BASE}/api/crm/my-prospects`, { headers: getAuthHeaders() });
          p = (prospRes.data?.data?.prospects || []).find(pr => Number(pr.id) === Number(stop.prospect_id));
        }
        setBriefByStop(prev => ({ ...prev, [key]: { type: 'Prospect', name: p?.customer_name || `Prospect #${stop.prospect_id}`, country: p?.country, orders: [], deals: 0, note: p?.notes } }));
      }
    } catch (_) { /* Non-blocking */ }
    setBriefLoadingByStop(prev => ({ ...prev, [key]: false }));
  }, [prospects]);

  /* ---------- geocoding + templates ---------- */
  const autoGeocodeStop = useCallback(async (idx, addressParts, countryCode) => {
    const query = addressParts.filter(Boolean).join(', ');
    if (!query) return;
    try {
      const params = { address: query };
      if (countryCode) params.countryCode = countryCode;
      const res = await axios.get(`${API_BASE}/api/crm/field-trips/geocode`, {
        headers: getAuthHeaders(),
        params,
      });
      const results = res.data?.data || [];
      if (results.length > 0) {
        const best = results[0];
        const lat = parseFloat(best.lat);
        const lng = parseFloat(best.lng);
        panToStopIdxRef.current = idx; // pan map to this stop after coords update
        updateStop(idx, { latitude: lat, longitude: lng, coordinates_persist_status: 'auto_resolved' });
      }
    } catch { /* non-blocking */ }
  }, []);

  // Search for a location inline within a stop card (hotel, address, etc.)
  const searchStopLocation = useCallback(async (idx, query, countryName) => {
    const q = (query || '').trim();
    if (!q) return;
    setStopSearch(prev => ({ ...prev, idx, loading: true, results: [] }));
    const resolvedCountry = countryName ? resolveCountryName(countryName) : '';
    const scopedQuery = resolvedCountry ? `${q}, ${resolvedCountry}` : q;
    try {
      const map = mapInstanceRef.current;
      // 1. Google Places searchByText
      if (map && window.google?.maps?.places?.Place) {
        try {
          const { Place } = window.google.maps.places;
          const request = { textQuery: scopedQuery, fields: ['displayName', 'location', 'formattedAddress'], maxResultCount: 6 };
          if (map.getBounds()) request.locationBias = map.getBounds();
          const { places } = await Place.searchByText(request);
          if (places?.length) {
            setStopSearch(prev => ({ ...prev, loading: false, results: places.map(p => ({
              display_name: p.formattedAddress ? `${p.displayName} — ${p.formattedAddress}` : p.displayName,
              name: p.displayName,
              lat: p.location.lat(),
              lng: p.location.lng(),
            })) }));
            return;
          }
        } catch { /* fall through */ }
      }
      // 2. Google Geocoder
      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: scopedQuery }, (results, status) => {
          if (status === 'OK' && results?.length) {
            setStopSearch(prev => ({ ...prev, loading: false, results: results.slice(0, 6).map(r => ({
              display_name: r.formatted_address || scopedQuery,
              name: r.formatted_address,
              lat: r.geometry.location.lat(),
              lng: r.geometry.location.lng(),
            })) }));
          } else {
            setStopSearch(prev => ({ ...prev, loading: false, results: [] }));
          }
        });
        return;
      }
      // 3. Nominatim fallback
      const res = await axios.get(`${API_BASE}/api/crm/field-trips/geocode`, {
        headers: getAuthHeaders(),
        params: { address: scopedQuery },
      });
      setStopSearch(prev => ({ ...prev, loading: false, results: (res.data?.data || []).slice(0, 6) }));
    } catch {
      setStopSearch(prev => ({ ...prev, loading: false, results: [] }));
    }
  }, []);

  // Apply a search result to a location stop
  const applyLocationSearchResult = useCallback((idx, result) => {
    const lat = Number(result?.lat);
    const lng = Number(result?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const addr = sanitizeLocationLabel(result.display_name?.split(',').slice(0, 3).join(', ')) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const city = cleanCityName(result?.city || cityFromGeocodeAddress(result?.address) || null);
    const country = resolveCountryName(result?.country) || result?.country || null;
    updateStop(idx, {
      latitude: lat,
      longitude: lng,
      stop_city: city,
      stop_country: country,
      address_snapshot: addr,
      coordinates_persist_status: 'saved',
    });
    panToStopIdxRef.current = idx;
    setStopSearch({ idx: null, query: '', results: [], loading: false });
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat, lng });
      mapInstanceRef.current.setZoom(13);
    }
  }, []);

  const applySharedLocationToStop = useCallback((idx, sharedLoc) => {
    const lat = Number(sharedLoc?.lat);
    const lng = Number(sharedLoc?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const resolvedCountry = resolveCountryName(sharedLoc?.country) || sharedLoc?.country || null;
    const resolvedCity = cleanCityName(sharedLoc?.city || null);
    updateStop(idx, {
      latitude: lat,
      longitude: lng,
      stop_city: resolvedCity,
      stop_country: resolvedCountry,
      address_snapshot: sanitizeLocationLabel(sharedLoc?.address || sharedLoc?.name) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      custom_label: sharedLoc?.label || stops[idx]?.custom_label || null,
      coordinates_persist_status: 'saved',
    });

    panToStopIdxRef.current = idx;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat, lng });
      mapInstanceRef.current.setZoom(13);
    }
    message.success('Location loaded from company library.');
  }, [message, resolveCountryName, stops, updateStop]);

  useEffect(() => {
    const targets = [];
    stops.forEach((stop) => {
      const isLocationStop = stop?.stop_type === 'location' || stop?.stop_type === 'custom';
      if (!isLocationStop || !stop?.stop_country) return;
      const key = buildSharedLocationKey(stop.stop_country, stop.custom_label || '');
      if (sharedLocationCacheRef.current.has(key) || sharedLocationLoadingRef.current.has(key)) return;
      targets.push({ countryName: stop.stop_country, label: stop.custom_label || '' });
    });

    if (!targets.length) return undefined;

    const timer = setTimeout(() => {
      targets.forEach((t) => {
        fetchSharedLocations({ countryName: t.countryName, label: t.label });
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [buildSharedLocationKey, fetchSharedLocations, stops]);

  // Add a blank location stop at the end
  const addLocationStop = useCallback(() => {
    const inheritCountry = stops.length > 0 ? stops[stops.length - 1].stop_country : (selectedCountryName || null);
    setStops(prev => [...prev, { ...createStop(), stop_type: 'location', duration_mins: 0, stop_country: inheritCountry }]);
    message.info('Location stop added — search for an address, hotel, or place.');
  }, [stops, selectedCountryName]);

  const geocodeAddress = async (query) => {
    const q = (query || geocodeQuery || '').trim();
    if (!q) return;
    try {
      const res = await axios.get(`${API_BASE}/api/crm/field-trips/geocode`, {
        headers: getAuthHeaders(),
        params: { address: q },
      });
      setGeocodeResults(res.data?.data || []);
    } catch {
      message.error('Geocoding failed');
    }
  };

  const applyGeocode = (result) => {
    if (geocodingIdx === null) return;
    const city = cleanCityName(result?.city || cityFromGeocodeAddress(result?.address) || null);
    const country = resolveCountryName(result?.country) || result?.country || null;
    updateStop(geocodingIdx, {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lng),
      stop_city: city,
      stop_country: country,
      address_snapshot: sanitizeLocationLabel(result.display_name.split(',').slice(0, 3).join(', ')),
    });
    setShowGeocodeModal(false);
    setGeocodeResults([]);
    setGeocodeQuery('');
    setGeocodingIdx(null);
  };

  const reverseGeocodeCoordinates = useCallback(async (lat, lng) => {
    try {
      const res = await axios.get(`${API_BASE}/api/crm/field-trips/reverse-geocode`, {
        headers: getAuthHeaders(),
        params: { lat, lng },
      });
      const row = res.data?.data || null;
      if (!row) return null;
      return {
        city: cleanCityName(row.city || null),
        country: resolveCountryName(row.country) || row.country || null,
        address: row.display_name || null,
      };
    } catch {
      return null;
    }
  }, [resolveCountryName]);

  const persistStopCoordinates = useCallback(async (stop, latitude, longitude, addressText = null) => {
    const payloadLat = Number(latitude);
    const payloadLng = Number(longitude);
    if (!hasValidCoordinates(payloadLat, payloadLng)) return;

    if (stop.customer_id) {
      await axios.put(`${API_BASE}/api/crm/customers/${stop.customer_id}`, {
        latitude: payloadLat,
        longitude: payloadLng,
        pin_confirmed: true,
      }, { headers: getAuthHeaders() });
      return;
    }

    if (stop.prospect_id) {
      await axios.patch(`${API_BASE}/api/crm/prospects/${stop.prospect_id}/location`, {
        latitude: payloadLat,
        longitude: payloadLng,
        address_line1: addressText || undefined,
      }, { headers: getAuthHeaders() });
    }
  }, []);

  const applyCoordinatesToStop = useCallback(async (idx, lat, lng, addressText = null) => {
    const target = stops[idx];
    if (!target) return;
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!hasValidCoordinates(nLat, nLng)) {
      message.warning('Invalid coordinates selected.');
      return;
    }

    const shouldPersistToEntity = Boolean(target.customer_id || target.prospect_id);

    panToStopIdxRef.current = idx; // pan map to this stop
    updateStop(idx, {
      latitude: nLat,
      longitude: nLng,
      address_snapshot: addressText || target.address_snapshot || `${nLat.toFixed(5)}, ${nLng.toFixed(5)}`,
      coordinates_persist_status: shouldPersistToEntity ? 'pending' : 'saved',
    });

    const needsGeoMeta = !target.stop_city || !target.stop_country;
    if (needsGeoMeta) {
      reverseGeocodeCoordinates(nLat, nLng).then((reverse) => {
        if (!reverse) return;
        updateStop(idx, {
          stop_city: reverse.city || target.stop_city || null,
          stop_country: reverse.country || target.stop_country || null,
          address_snapshot: reverse.address || addressText || target.address_snapshot || `${nLat.toFixed(5)}, ${nLng.toFixed(5)}`,
          coordinates_persist_status: shouldPersistToEntity ? 'pending' : 'saved',
        });
      });
    }

    if (!shouldPersistToEntity) {
      message.success(`Location set for stop #${idx + 1}`);
      return;
    }

    setSavingLocationIdx(idx);
    try {
      await persistStopCoordinates(target, nLat, nLng, addressText);
      updateStop(idx, { coordinates_persist_status: 'saved' });
      message.success(`Location saved for stop #${idx + 1}`);
    } catch (err) {
      updateStop(idx, { coordinates_persist_status: 'failed' });
      message.warning(err?.response?.data?.error || 'Location set for trip, but failed to persist to entity record.');
    } finally {
      setSavingLocationIdx(null);
    }
  }, [stops, persistStopCoordinates, reverseGeocodeCoordinates, message]);

  useEffect(() => {
    applyCoordinatesToStopRef.current = applyCoordinatesToStop;
  }, [applyCoordinatesToStop]);

  // Initialise Google Maps DirectionsService once the map is ready
  useEffect(() => {
    if (!mapReady) return;
    if (!directionsServiceRef.current && window.google?.maps?.DirectionsService) {
      directionsServiceRef.current = new window.google.maps.DirectionsService();
    }
  }, [mapReady]);

  const resolveGoogleUrlForStop = async () => {
    const idx = googleUrlTargetIdx;
    if (idx === null || !googleMapsUrl.trim()) return;
    const sanitizedUrl = googleMapsUrl.trim().replace(/[\s);,!?]+$/g, '');
    try {
      const res = await axios.post(`${API_BASE}/api/crm/resolve-google-maps-url`, {
        url: sanitizedUrl,
      }, { headers: getAuthHeaders() });
      const lat = res.data?.coordinates?.lat;
      const lng = res.data?.coordinates?.lng;
      if (!hasValidCoordinates(lat, lng)) {
        message.warning('Could not extract valid coordinates from this URL.');
        return;
      }
      await applyCoordinatesToStop(idx, lat, lng);
      setShowGoogleUrlModal(false);
      setGoogleUrlTargetIdx(null);
      setGoogleMapsUrl('');
    } catch (err) {
      const fallbackSource = err?.response?.data?.resolvedUrl || sanitizedUrl;
      const fallbackCoords = extractCoordinatesFromUrlText(fallbackSource);
      if (fallbackCoords && hasValidCoordinates(fallbackCoords.lat, fallbackCoords.lng)) {
        await applyCoordinatesToStop(idx, fallbackCoords.lat, fallbackCoords.lng);
        setShowGoogleUrlModal(false);
        setGoogleUrlTargetIdx(null);
        setGoogleMapsUrl('');
        message.success('Location extracted and applied from Google URL.');
        return;
      }
      message.error(err?.response?.data?.error || 'Failed to parse Google Maps URL');
    }
  };

  // Derive the country to scope map searches: use the active pin stop's country first,
  // then fall back to the trip's origin country.
  const mapSearchScopeCountry = useMemo(() => {
    // Priority 1: active pin mode — always use that specific stop's country
    if (pinTargetIdx !== null) {
      const stopCountry = stops[pinTargetIdx]?.stop_country;
      if (stopCountry) return resolveCountryName(stopCountry) || stopCountry;
    }
    // Priority 2: if all stops share exactly one country, search is clearly in that country
    const stopCountries = [...new Set(stops.map(s => s.stop_country).filter(Boolean))];
    if (stopCountries.length === 1) return resolveCountryName(stopCountries[0]) || stopCountries[0];
    // Priority 3: single destination country on an international trip
    if (destinationCountryNames?.length === 1) return destinationCountryNames[0];
    // Priority 4: local trip — origin IS the destination
    if (tripType === 'local') return selectedCountryName || '';
    // Multiple countries or unknown — no single scope
    return '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinTargetIdx, stops, selectedCountryName, destinationCountryNames, tripType]);

  const searchMapPlaces = async () => {
    const q = mapSearchQuery.trim();
    if (!q) return;
    setMapSearching(true);
    const scopedQuery = mapSearchScopeCountry ? `${q}, ${mapSearchScopeCountry}` : q;
    const countryBounds = mapSearchScopeCountry ? COUNTRY_BOUNDS[mapSearchScopeCountry] : null;
    try {
      const map = mapInstanceRef.current;

      const getBias = () => {
        if (countryBounds && window.google?.maps?.LatLngBounds) {
          return new window.google.maps.LatLngBounds(
            { lat: countryBounds.south, lng: countryBounds.west },
            { lat: countryBounds.north, lng: countryBounds.east },
          );
        }
        return map?.getBounds() || null;
      };

      // 1. Google Places searchByText (New) — best for hotels, POIs, businesses
      if (map && window.google?.maps?.places?.Place) {
        try {
          const { Place } = window.google.maps.places;
          const request = {
            textQuery: scopedQuery,
            fields: ['displayName', 'location', 'formattedAddress'],
            maxResultCount: 10,
          };
          const bias = getBias();
          if (bias) request.locationBias = bias;
          const { places } = await Place.searchByText(request);
          if (places?.length) {
            setMapSearchResults(places.map(p => ({
              display_name: p.formattedAddress ? `${p.displayName} — ${p.formattedAddress}` : p.displayName,
              name: p.displayName,
              lat: p.location.lat(),
              lng: p.location.lng(),
              city: '',
              country: '',
            })));
            setMapSearching(false);
            return;
          }
        } catch (placesErr) {
          console.warn('Places searchByText failed, falling back to Geocoder:', placesErr?.message);
        }
      }

      // 2. Google Geocoder — address-level fallback
      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: scopedQuery }, (results, status) => {
          setMapSearching(false);
          if (status === 'OK' && results?.length) {
            setMapSearchResults(results.slice(0, 6).map(r => ({
              display_name: r.formatted_address || scopedQuery,
              name: r.formatted_address,
              lat: r.geometry.location.lat(),
              lng: r.geometry.location.lng(),
              city: '',
              country: '',
            })));
          } else {
            setMapSearchResults([]);
            message.info('No results found. Try a more specific name (e.g. "Rotana Riyadh").');
          }
        });
        return;
      }

      setMapSearchResults([]);
      message.info('No matching locations found.');
      setMapSearching(false);
    } catch {
      message.error('Map search failed');
      setMapSearching(false);
    }
  };

  const centerMapOnSearchResult = (result) => {
    const lat = Number(result?.lat);
    const lng = Number(result?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !mapInstanceRef.current) return;
    mapInstanceRef.current.panTo({ lat, lng });
    mapInstanceRef.current.setZoom(13);
  };

  const addSearchResultAsStop = (result) => {
    const lat = Number(result?.lat);
    const lng = Number(result?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setStops(prev => ([...prev, {
      ...createStop(),
      stop_type: 'location',
      duration_mins: 0,
      latitude: lat,
      longitude: lng,
      stop_city: cleanCityName(result?.city || cityFromGeocodeAddress(result?.address) || null),
      stop_country: resolveCountryName(result?.country) || result?.country || null,
      coordinates_persist_status: 'saved',
      address_snapshot: sanitizeLocationLabel(result.display_name?.split(',').slice(0, 3).join(', ')) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    }]));
    centerMapOnSearchResult(result);
    message.success('Location added as stop.');
  };

  const validateStops = () => {
    const issues = [];
    stops.forEach((s, idx) => {
      const hasCustomer = !!s.customer_id;
      const hasProspect = !!s.prospect_id;
      const hasCoords = hasValidCoordinates(s.latitude, s.longitude);
      const hasAddress = Boolean((s.address_snapshot || '').trim());

      if (s.stop_type === 'customer' && !hasCustomer) {
        issues.push(`Stop ${idx + 1}: select a customer`);
      }
      if (s.stop_type === 'prospect' && !hasProspect && !hasCoords) {
        issues.push(`Stop ${idx + 1}: select a prospect or pin/search a location`);
      } else if (!hasCoords) {
        issues.push(`Stop ${idx + 1}: location required. Use Pin On Map or Google URL.`);
      }
      if (isEntityLinkedStop(s) && !hasResolvedStopCoordinates(s)) {
        issues.push(`Stop ${idx + 1}: location not saved to ${hasCustomer ? 'customer' : 'prospect'} record. Pin On Map or Google URL and save.`);
      }
      if (hasCoords && !hasAddress) {
        issues.push(`Stop ${idx + 1}: add address/label for mapped point`);
      }
    });

    if (issues.length > 0) {
      message.warning({
        content: `Please fix stop data before continuing. First issue: ${issues[0]}`,
        duration: 4,
      });
      return false;
    }
    return true;
  };

  /* ---------- load from previous trip ---------- */
  const loadPreviousTrips = async () => {
    setPrevTripsLoading(true);
    setShowPrevTripsModal(true);
    try {
      const res = await axios.get(`${API_BASE}/api/crm/field-trips`, {
        headers: getAuthHeaders(),
        params: { limit: 50 },
      });
      setPrevTrips(res.data?.data || []);
    } catch {
      message.error('Failed to load previous trips');
    } finally {
      setPrevTripsLoading(false);
    }
  };

  const cloneFromTrip = async (tripId) => {
    try {
      const res = await axios.post(`${API_BASE}/api/crm/field-trips/${tripId}/clone`, {}, { headers: getAuthHeaders() });
      const newTripId = res.data?.data?.id;
      if (!newTripId) { message.error('Clone failed — no trip ID returned'); return; }
      message.success('Trip duplicated! Opening for editing…');
      setShowPrevTripsModal(false);
      navigate(`/crm/visits/${newTripId}/edit`);
    } catch {
      message.error('Failed to duplicate trip');
    }
  };

  /* ---------- save trip ---------- */
  const onSave = async () => {
    try {
      await form.validateFields();
    } catch { return; }
    const hasInvalidLegTiming = legs.some(
      (l) => l?.dep_datetime && l?.arr_datetime && dayjs(l.arr_datetime).isBefore(dayjs(l.dep_datetime))
    );
    if (hasInvalidLegTiming) {
      message.warning('Fix transport legs: arrival must be after departure.');
      return;
    }
    if (!validateStops()) return;
    setSaving(true);
    setError('');
    try {
      const payload = buildTripPayload();
      // Enrich stops with route intelligence
      payload.stops = stops.map((s, idx) => {
        const { local_id, ...rest } = s;
        const eta = etaChain[idx];
        return {
          ...rest,
          stop_order: idx + 1,
          visit_date: s.visit_date ? dayjs(s.visit_date).format('YYYY-MM-DD') : null,
          ...(eta?.arrivalTxt ? { planned_eta: eta.arrivalTxt } : {}),
          ...(routeLegs[idx - 1]?.distanceM ? { est_drive_km: Math.round(routeLegs[idx - 1].distanceM / 100) / 10 } : {}),
          ...(routeLegs[idx - 1]?.durationSec ? { est_drive_sec: routeLegs[idx - 1].durationSec } : {}),
        };
      });
      payload.status = 'planning';
      let id;
      if (editingTripId) {
        await axios.put(`${API_BASE}/api/crm/field-trips/${editingTripId}/full`, payload, { headers: getAuthHeaders() });
        id = editingTripId;
      } else {
        const res = await axios.post(`${API_BASE}/api/crm/field-trips`, payload, { headers: getAuthHeaders() });
        id = res.data?.data?.id;
      }
      message.success(editingTripId ? 'Trip updated successfully!' : 'Trip created successfully!');
      navigate(id ? `/crm/visits/${id}` : '/crm/visits');
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save trip.');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- step validation ---------- */
  const canAdvance = () => {
    if (step === 0) {
      const vals = form.getFieldsValue(true);
      if (!vals.title || !vals.country_code || !vals.departure_date || !vals.return_date) return false;
      if (dayjs(vals.return_date).isBefore(dayjs(vals.departure_date), 'day')) return false;
      if ((vals.trip_type || tripType) === 'international' && (!vals.destination_countries || vals.destination_countries.length === 0)) return false;
      if (legs.some((l) => l?.dep_datetime && l?.arr_datetime && dayjs(l.arr_datetime).isBefore(dayjs(l.dep_datetime)))) return false;
      return true;
    }
    if (step === 1) return stops.length > 0;
    return true;
  };

  const canAdvanceToStep = (targetStep) => {
    if (targetStep <= step) return true;
    for (let check = step; check < targetStep; check++) {
      if (check === 0) {
        const vals = form.getFieldsValue(true);
        if (!vals.title || !vals.country_code || !vals.departure_date || !vals.return_date) {
          message.warning('Please complete Trip Info before continuing.');
          return false;
        }
        if (dayjs(vals.return_date).isBefore(dayjs(vals.departure_date), 'day')) {
          message.warning('Return date cannot be before departure date.');
          return false;
        }
        if ((vals.trip_type || tripType) === 'international' && (!vals.destination_countries || vals.destination_countries.length === 0)) {
          message.warning('Select at least one destination country for international trips.');
          return false;
        }
        if (legs.some((l) => l?.dep_datetime && l?.arr_datetime && dayjs(l.arr_datetime).isBefore(dayjs(l.dep_datetime)))) {
          message.warning('Fix transport legs: arrival must be after departure.');
          return false;
        }
      }
      if (check === 1 && stops.length === 0) {
        message.warning('Add at least one stop before review.');
        return false;
      }
    }
    return true;
  };

  const unresolvedGpsCount = useMemo(() => stops.filter(s => !hasResolvedStopCoordinates(s)).length, [stops]);

  /* ---------- trip summary totals ---------- */
  const tripSummary = useMemo(() => {
    const totalDistanceM = routeLegs.reduce((acc, l) => acc + (l?.distanceM || 0), 0);
    const totalDriveSec  = routeLegs.filter(l => !l?.transit).reduce((acc, l) => acc + (l?.durationSec || 0), 0);
    const totalTransitSec = routeLegs.filter(l => l?.transit).reduce((acc, l) => acc + (l?.durationSec || 0), 0);
    const totalMeetingSec = stops.filter(s => s.stop_type !== 'location').reduce((acc, s) => acc + (s.duration_mins || 60) * 60, 0);
    const totalDaySec = totalDriveSec + totalTransitSec + totalMeetingSec + bufferMins * 60 * Math.max(0, stops.length - 1);
    const distTxt = totalDistanceM >= 1000
      ? `${(totalDistanceM / 1000).toFixed(1)} km`
      : totalDistanceM > 0 ? `${totalDistanceM} m` : null;
    return {
      totalDistanceTxt: distTxt,
      totalDriveTxt:    totalDriveSec   > 0 ? fmtDuration(totalDriveSec)   : null,
      totalTransitTxt: totalTransitSec > 0 ? fmtDuration(totalTransitSec) : null,
      totalMeetingTxt:  totalMeetingSec > 0 ? fmtDuration(totalMeetingSec) : null,
      totalDaySec,
      totalDayTxt:  fmtDuration(totalDaySec),
      overrunSec:   Math.max(0, totalDaySec - 36000),
      overrunTxt:   totalDaySec > 36000 ? fmtDuration(totalDaySec - 36000) : null,
    };
  }, [routeLegs, stops, bufferMins]);

  const reviewMapStops = useMemo(() => stops.map((s, idx) => ({
    ...s,
    stop_order: idx + 1,
    customer_name: s.customer_id && customerMap.has(s.customer_id) ? customerMap.get(s.customer_id).label : null,
    prospect_name: s.prospect_id && prospectMap.has(s.prospect_id) ? prospectMap.get(s.prospect_id).label : null,
  })), [stops, customerMap, prospectMap]);

  const reviewRouteFlow = useMemo(() => {
    const nodes = reviewMapStops.map((stop, idx) => {
      const customerData = stop.customer_id && customerMap.has(stop.customer_id)
        ? customerMap.get(stop.customer_id).data
        : null;
      const prospectData = stop.prospect_id && prospectMap.has(stop.prospect_id)
        ? prospectMap.get(stop.prospect_id).data
        : null;

      const prevCountry = idx > 0 ? reviewMapStops[idx - 1]?.stop_country : null;
      const nextCountry = idx < reviewMapStops.length - 1 ? reviewMapStops[idx + 1]?.stop_country : null;
      const inferredFallback = prevCountry || nextCountry || routeGeoSummary.countries[0] || null;
      const geo = resolveStopGeoMeta(stop, customerData, prospectData, inferredFallback);
      const country = geo.country || '—';
      const city = geo.city;
      const label = sanitizeLocationLabel(stop.customer_name || stop.prospect_name || stop.address_snapshot) || `Stop ${idx + 1}`;

      return {
        idx,
        country,
        city,
        label,
        stopType: stop.stop_type || 'other',
      };
    });

    const groups = [];
    let activeGroup = null;
    nodes.forEach((node) => {
      const nodeCountryKey = String(node.country || '').trim().toLowerCase();
      const activeCountryKey = activeGroup ? String(activeGroup.country || '').trim().toLowerCase() : null;
      if (!activeGroup || nodeCountryKey !== activeCountryKey) {
        activeGroup = { country: node.country, stops: [], cities: [], _citySeen: new Set(), totalDriveSec: 0, totalDistanceM: 0 };
        groups.push(activeGroup);
      }
      activeGroup.stops.push(node);
      if (node.city) {
        const cityKey = String(node.city).trim().toLowerCase();
        if (!activeGroup._citySeen.has(cityKey)) {
          activeGroup._citySeen.add(cityKey);
          activeGroup.cities.push(node.city);
        }
      }
    });

    groups.forEach((group, groupIdx) => {
      const firstStopIdx = group.stops[0]?.idx;
      const lastStopIdx = group.stops[group.stops.length - 1]?.idx;
      if (Number.isInteger(firstStopIdx) && Number.isInteger(lastStopIdx)) {
        for (let i = firstStopIdx; i < lastStopIdx; i++) {
          if (!routeLegs[i]?.transit) {
            group.totalDriveSec += Number(routeLegs[i]?.durationSec) || 0;
          }
          group.totalDistanceM += Number(routeLegs[i]?.distanceM) || 0;
        }
      }

      const hopLeg = Number.isInteger(lastStopIdx) ? routeLegs[lastStopIdx] : null;
      if (groupIdx < groups.length - 1) {
        group.hopToNext = {
          durationTxt: hopLeg?.durationTxt || (hopLeg?.durationSec ? fmtDuration(hopLeg.durationSec) : null),
          distanceTxt: hopLeg?.distanceTxt || null,
          transit: Boolean(hopLeg?.transit),
          crossCountry: Boolean(hopLeg?.crossCountry),
          mode: group.stops[group.stops.length - 1]?.stopType === 'location' ? null : (stops[lastStopIdx]?.transport_to_next || null),
        };
      } else {
        group.hopToNext = null;
      }
    });

    const normalizedGroups = groups.map(({ _citySeen, ...rest }) => {
      const normCountry = hasLatinChars(rest.country)
        ? rest.country
        : (resolveCountryName(rest.country) || rest.country);
      const normCities = rest.cities.some(hasLatinChars) ? rest.cities.filter(hasLatinChars) : rest.cities;
      return { ...rest, country: normCountry, cities: normCities };
    });
    return {
      nodes,
      groups: normalizedGroups,
      countryHops: normalizedGroups.map((g) => g.country),
    };
  }, [reviewMapStops, customerMap, prospectMap, routeLegs, stops, routeGeoSummary.countries, resolveStopGeoMeta, resolveCountryName]);

  /* ---------- per-stop ETA chain ---------- */
  const etaChain = useMemo(() => {
    const result = new Array(stops.length).fill(null);
    let prevEndSec = null;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const scheduledSec = parseTimeSec(s.visit_time);
      const durationSec  = (s.duration_mins ?? 60) * 60;
      if (i === 0) {
        if (scheduledSec !== null) prevEndSec = scheduledSec + durationSec;
        result[0] = scheduledSec !== null
          ? { expectedArrivalSec: scheduledSec, arrivalTxt: formatTimeSec(scheduledSec), scheduledSec, isLate: false, lateMins: 0 }
          : null;
        continue;
      }
      if (prevEndSec === null) {
        if (scheduledSec !== null) prevEndSec = scheduledSec + durationSec;
        result[i] = null;
        continue;
      }
      const leg = routeLegs[i - 1];
      let legSec = leg?.durationSec || 0;
      // For cross-country transit legs: use the transit duration, reset the chain anchor
      // since the stop is in a new timezone/location
      if (leg?.transit && leg.transitLeg?.arr_datetime) {
        // Use arrival time from the transit leg as the new anchor
        const arrDate = new Date(leg.transitLeg.arr_datetime);
        const arrivalSecOfDay = arrDate.getHours() * 3600 + arrDate.getMinutes() * 60;
        const isLate   = scheduledSec !== null && arrivalSecOfDay > scheduledSec + 300;
        const lateMins = scheduledSec !== null ? Math.max(0, Math.round((arrivalSecOfDay - scheduledSec) / 60)) : 0;
        result[i] = { expectedArrivalSec: arrivalSecOfDay, arrivalTxt: formatTimeSec(arrivalSecOfDay), scheduledSec, isLate, lateMins };
        const actualStartSec = scheduledSec !== null ? scheduledSec : arrivalSecOfDay;
        prevEndSec = actualStartSec + durationSec;
        continue;
      }
      const expectedArrivalSec = prevEndSec + legSec + bufferMins * 60;
      const isLate   = scheduledSec !== null && expectedArrivalSec > scheduledSec + 300; // 5-min tolerance
      const lateMins = scheduledSec !== null ? Math.max(0, Math.round((expectedArrivalSec - scheduledSec) / 60)) : 0;
      result[i] = { expectedArrivalSec, arrivalTxt: formatTimeSec(expectedArrivalSec), scheduledSec, isLate, lateMins };
      const actualStartSec = scheduledSec !== null ? scheduledSec : expectedArrivalSec;
      prevEndSec = actualStartSec + durationSec;
    }
    return result;
  }, [stops, routeLegs, bufferMins]);

  const reviewTripHealth = useMemo(() => {
    const lateCount = etaChain.filter(e => e?.isLate).length;
    const resolvedGps = stops.filter(s => hasResolvedStopCoordinates(s)).length;
    const customerStops = stops.filter(s => s.stop_type === 'customer').length;
    const prospectStops = stops.filter(s => s.stop_type === 'prospect').length;
    const locationStops = stops.filter(s => s.stop_type === 'location' || s.stop_type === 'custom').length;
    return {
      lateCount,
      resolvedGps,
      customerStops,
      prospectStops,
      locationStops,
    };
  }, [etaChain, stops]);

  const toggleMapFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (mapCardWrapRef.current?.requestFullscreen) {
          await mapCardWrapRef.current.requestFullscreen();
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
      setTimeout(() => {
        if (mapInstanceRef.current) window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
      }, 100);
    } catch {
      message.warning('Could not toggle fullscreen mode.');
    }
  };

  /* ================================================================
     RENDER
     ================================================================ */
  const headerGradient = 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)';

  /* ---------- auto-fill visit times from drive + buffer chain ---------- */
  const autoFillTimes = useCallback(() => {
    const anchor = stops.findIndex(s => s.visit_time);
    if (anchor === -1) {
      message.info('Set a departure time on the first stop, then click Auto-fill.');
      return;
    }
    setStops(prev => {
      const next = [...prev];
      let prevEndSec = null;
      for (let i = 0; i < next.length; i++) {
        const s = next[i];
        const scheduledSec = parseTimeSec(s.visit_time);
        const durationSec  = (s.duration_mins ?? 60) * 60;
        if (i <= anchor || prevEndSec === null) {
          if (scheduledSec !== null) prevEndSec = scheduledSec + durationSec;
          continue;
        }
        const leg = routeLegs[i - 1];
        const legSec = leg?.durationSec || 0;
        let arriveSec;
        if (leg?.transit && leg.transitLeg?.arr_datetime) {
          // Use flight/transit arrival time as the anchor
          const ad = new Date(leg.transitLeg.arr_datetime);
          arriveSec = ad.getHours() * 3600 + ad.getMinutes() * 60 + bufferMins * 60;
        } else {
          arriveSec = prevEndSec + legSec + bufferMins * 60;
        }
        if (!s.visit_time) {
          // e.g. "09:30:00" — backend accepts HH:MM:SS
          next[i] = { ...s, visit_time: `${formatTimeSec(arriveSec)}:00` };
        }
        const actualStartSec = parseTimeSec(next[i].visit_time) ?? arriveSec;
        prevEndSec = actualStartSec + durationSec;
      }
      return next;
    });
    message.success('Visit times auto-filled based on drive times and buffer.');
  }, [stops, routeLegs, bufferMins, message]);

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ background: headerGradient, borderRadius: 12, padding: '20px 28px', marginBottom: 20, color: '#fff' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined style={{ color: '#fff' }} />} onClick={() => navigate('/crm/visits')} />
            <div>
              <Title level={4} style={{ margin: 0, color: '#fff' }}><CompassOutlined /> Plan Field Visit Trip</Title>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Create your itinerary, arrange stops, and prepare briefs before departure.</Text>
            </div>
          </Space>
          <Tag color={tripType === 'international' ? 'blue' : 'green'} style={{ fontSize: 13, padding: '4px 12px' }}>
            {tripType === 'international' ? <><GlobalOutlined /> International</> : <><CarOutlined /> Local</>}
          </Tag>
          <Space size={12}>
            <Text style={{ color: autoSaveStatus === 'error' ? '#ff7875' : 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              <CloudSyncOutlined spin={autoSaveStatus === 'saving'} />{' '}
              {autoSaveStatus === 'saving' ? 'Saving…' : autoSaveStatus === 'error' ? 'Save failed' : lastAutoSaveTime ? `Saved ${dayjs(lastAutoSaveTime).format('HH:mm')}` : editingTripId ? 'Saved' : 'Not yet saved'}
            </Text>
            <Tooltip title="Duplicate or reuse structure from a previous trip">
              <Button size="small" ghost icon={<RetweetOutlined />} onClick={loadPreviousTrips}>Load Previous</Button>
            </Tooltip>
          </Space>
        </Space>
      </div>

      {/* Steps */}
      <Steps
        current={step}
        onChange={(s) => { if (s < step || canAdvanceToStep(s)) setStep(s); }}
        size="small"
        style={{ marginBottom: 20 }}
        items={[
          { title: 'Trip Info', icon: <RocketOutlined /> },
          { title: 'Stops & Route', icon: <EnvironmentOutlined /> },
          { title: 'Review & Save', icon: <CheckCircleOutlined /> },
        ]}
      />

      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />}

      {!routeTripId && existingDraftsCount > 0 && !draftBannerDismissed && (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={() => setDraftBannerDismissed(true)}
          message={`You have ${existingDraftsCount} unfinished trip${existingDraftsCount > 1 ? 's' : ''} already saved. Use "Continue Planning" from the trip list to resume — or keep going to create a new one.`}
          action={<Button size="small" onClick={() => navigate('/crm/visits')}>Go to My Trips</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ============ STEP 0: Trip Info ============ */}
      {step === 0 && (
        <Card styles={{ body: { padding: '16px 20px 4px' } }}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ trip_type: 'local', visa_required: false }}
            size="middle"
            onValuesChange={(_, allValues) => {
              formSnapshotRef.current = { ...formSnapshotRef.current, ...allValues };
            }}
          >
            <Row gutter={12}>
              <Col xs={24} md={isManager && salesReps.length > 0 ? 7 : 10}>
                <Form.Item label="Trip Title" name="title" rules={[{ required: true, message: 'Required' }]} tooltip="Give your trip a short, descriptive name">
                  <Input placeholder="e.g. SA Client Visits — Mar 2026" maxLength={80} showCount />
                </Form.Item>
              </Col>
              {isManager && salesReps.length > 0 && (
                <Col xs={24} md={5}>
                  <Form.Item label="Plan Trip For" tooltip="Select a sales rep to plan on their behalf">
                    <Select
                      placeholder="Myself"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={selectedRepId}
                      onChange={(v) => { setSelectedRepId(v || null); setStops([]); }}
                      options={salesReps.map(r => ({ value: r.user_id, label: r.full_name }))}
                    />
                  </Form.Item>
                </Col>
              )}
              <Col xs={12} md={4}>
                <Form.Item label="Trip Type" name="trip_type" tooltip="Local = within home country. International = visiting other countries.">
                  <Select options={[{ value: 'local', label: 'Local' }, { value: 'international', label: 'International' }]} />
                </Form.Item>
              </Col>
              <Col xs={12} md={isManager && salesReps.length > 0 ? 4 : 5}>
                <Form.Item
                  label={tripType === 'international' ? 'Origin Country' : 'Country'}
                  name="country_code"
                  rules={[{ required: true, message: 'Required' }]}
                  tooltip={tripType === 'international' ? 'Your departure country' : 'Your country'}
                >
                  <Select
                    showSearch
                    allowClear={tripType !== 'local'}
                    disabled={tripType === 'local'}
                    placeholder="Country"
                    optionFilterProp="label"
                    loading={loadingLookups}
                    options={countryOptions}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="Departure" name="departure_date" rules={[{ required: true, message: 'Required' }]} tooltip="Date you leave">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            {tripType === 'international' && (
              <Row gutter={12}>
                <Col xs={24} md={16}>
                  <Form.Item
                    label="Destination Countries"
                    name="destination_countries"
                    tooltip="Select all countries you will visit"
                    rules={[{ required: true, message: 'Select at least one destination' }]}
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      placeholder="e.g. South Africa, Zimbabwe"
                      optionFilterProp="label"
                      loading={loadingLookups}
                      options={destinationCountryOptions}
                    />
                  </Form.Item>
                </Col>
              </Row>
            )}

            <Row gutter={12}>
              <Col xs={12} md={4}>
                <Form.Item
                  label="Return Date"
                  name="return_date"
                  dependencies={['departure_date']}
                  tooltip="Date you return"
                  rules={[
                    { required: true, message: 'Required' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        const dep = getFieldValue('departure_date');
                        if (!value || !dep) return Promise.resolve();
                        if (dayjs(value).isBefore(dayjs(dep), 'day')) {
                          return Promise.reject(new Error('Must be after departure'));
                        }
                        return Promise.resolve();
                      },
                    }),
                  ]}
                >
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Transport Mode" name="transport_mode" tooltip="All transport methods for this trip">
                  <Select mode="multiple" allowClear placeholder="Select modes" options={TRANSPORT_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item label="Budget (AED)" name="budget_estimate" tooltip="Estimated total trip budget">
                  <InputNumber style={{ width: '100%' }} placeholder="0.00" min={0} />
                </Form.Item>
              </Col>
              <Col xs={6} md={2}>
                <Form.Item label="Visa" name="visa_required" valuePropName="checked" tooltip="Toggle if visa is needed">
                  <Switch />
                </Form.Item>
              </Col>
              {visaRequired && (
                <Col xs={18} md={4}>
                  <Form.Item label="Visa Type" name="visa_type" tooltip="Type of visa needed">
                    <Select placeholder="Select" allowClear options={[
                      { value: 'none', label: 'None Required' },
                      { value: 'tourist', label: 'Tourist' },
                      { value: 'business', label: 'Business' },
                      { value: 'transit', label: 'Transit' },
                      { value: 'on_arrival', label: 'On Arrival' },
                      { value: 'e_visa', label: 'e-Visa' },
                    ]} />
                  </Form.Item>
                </Col>
              )}
            </Row>

            <FieldVisitChecklistPanel tripType={tripType} checklist={checklist} onChange={setChecklist} />

            {tripType === 'international' && (
              <Form.Item label="Accommodation" name="accommodation" tooltip="Hotel names, booking refs, or details per destination" style={{ marginBottom: 8 }}>
                <Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} placeholder="Hotel name, booking ref, etc." />
              </Form.Item>
            )}

            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item label="Trip Objectives" name="objectives" tooltip="Main goals of this trip" style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} placeholder="e.g. Close deals, onboard new clients" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Travel Notes" name="travel_notes" tooltip="Additional logistics — flight info, car rental, etc." style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} placeholder="Flight info, hotel, logistics" />
                </Form.Item>
              </Col>
            </Row>
          </Form>

          {(tripType === 'international' || transportMode.includes('flight')) && (
            <FieldVisitLegForm legs={legs} onChange={setLegs} />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Button
              icon={<SaveOutlined />}
              loading={autoSaveStatus === 'saving'}
              onClick={async () => {
                try {
                  const fieldsToValidate = ['title', 'country_code', 'departure_date', 'return_date'];
                  if (tripType === 'international') fieldsToValidate.push('destination_countries');
                  await form.validateFields(fieldsToValidate);
                  const vals = form.getFieldsValue(true);
                  if (vals.country_code) setPlannerCountryCode(vals.country_code);
                  setSavedTripType(vals.trip_type || 'local');
                  setSavedDestinations(vals.destination_countries || []);
                  setSavedDeparture(vals.departure_date ? dayjs(vals.departure_date).format('YYYY-MM-DD') : null);
                  setSavedReturn(vals.return_date ? dayjs(vals.return_date).format('YYYY-MM-DD') : null);
                  formSnapshotRef.current = { ...vals };
                  await autoSaveTrip();
                } catch {
                  // validation errors shown inline
                }
              }}
            >
              Save Draft
            </Button>
            <Button type="primary" onClick={async () => {
              try {
                const fieldsToValidate = ['title', 'country_code', 'departure_date', 'return_date'];
                if (tripType === 'international') fieldsToValidate.push('destination_countries');
                await form.validateFields(fieldsToValidate);
                const vals = form.getFieldsValue(true);
                if (vals.country_code) setPlannerCountryCode(vals.country_code);
                setSavedTripType(vals.trip_type || 'local');
                setSavedDestinations(vals.destination_countries || []);
                setSavedDeparture(vals.departure_date ? dayjs(vals.departure_date).format('YYYY-MM-DD') : null);
                setSavedReturn(vals.return_date ? dayjs(vals.return_date).format('YYYY-MM-DD') : null);
                formSnapshotRef.current = { ...vals };
                await autoSaveTrip();
                setStep(1);
              } catch {
                // form.validateFields already shows inline error messages
              }
            }}>
              Next: Add Stops <SwapOutlined />
            </Button>
          </div>
        </Card>
      )}

      {/* ============ STEP 1: Stops & Route ============ */}
      {step === 1 && (
        <Row gutter={16}>
          {/* Left: Stop Editor */}
          <Col xs={24} lg={14}>
            <Card
              title={<Space><EnvironmentOutlined /> Stops ({stops.length})</Space>}
              extra={
                <Space wrap size={6}>
                  <Tooltip title="Draft stops from your assigned customers">
                    <Button size="small" icon={<PlusOutlined />} onClick={() => { setDraftModalType('customers'); setDraftSelection([]); setDraftCountryScoped(true); setDraftCountryFilter(destinationCountryNames.length === 1 ? destinationCountryNames[0] : null); }}><ShopOutlined /> Customers</Button>
                  </Tooltip>
                  <Tooltip title="Draft stops from your prospects">
                    <Button size="small" icon={<PlusOutlined />} onClick={() => { setDraftModalType('prospects'); setDraftSelection([]); setDraftCountryScoped(true); setDraftCountryFilter(destinationCountryNames.length === 1 ? destinationCountryNames[0] : null); }}><StarOutlined /> Prospects</Button>
                  </Tooltip>
                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setShowNewProspect(true)}><UserAddOutlined /> New Lead</Button>
                  <Tooltip title="Add a location stop (hotel, airport, office, etc.)">
                    <Button size="small" icon={<PlusOutlined />} onClick={addLocationStop}><HomeOutlined /> Location</Button>
                  </Tooltip>
                  <Button size="small" icon={<RetweetOutlined />} onClick={optimizeRoute}>Optimize</Button>
                  {optimizePreviewPending && (
                    <>
                      <Button size="small" type="primary" onClick={acceptOptimizedPreview}>Accept</Button>
                      <Button size="small" danger onClick={discardOptimizedPreview}>Discard</Button>
                    </>
                  )}
                </Space>
              }
              styles={{ body: { padding: '12px 16px', maxHeight: isMobile ? undefined : 620, overflowY: 'auto' } }}
            >
              {stops.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No stops yet. Add customers, prospects, leads, or locations using the top actions or map search." />}
              {stops.length > 0 && unresolvedGpsCount > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 10 }}
                  message={`${unresolvedGpsCount} stop(s) require location action. Use Pin On Map or Google URL before continuing.`}
                />
              )}

              {/* ── Route Intelligence Summary Bar ── */}
              {stops.length >= 2 && (
                <div style={{ background: 'linear-gradient(90deg,#f0f5ff,#f5f0ff)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                  <Space size={10} wrap>
                    <Text style={{ fontSize: 12 }}>
                      <CarOutlined style={{ color: '#1677ff', marginRight: 4 }} />
                      {routeLegsLoading
                        ? <Text type="secondary" style={{ fontSize: 12 }}>Calculating…</Text>
                        : tripSummary.totalDistanceTxt
                          ? <><Text style={{ fontSize: 12, fontWeight: 600 }}>{tripSummary.totalDistanceTxt}</Text><Text type="secondary" style={{ fontSize: 12 }}> route</Text></>
                          : <Text type="secondary" style={{ fontSize: 12 }}>No coords yet</Text>}
                    </Text>
                    {!routeLegsLoading && tripSummary.totalDriveTxt && (
                      <Text style={{ fontSize: 12 }}>
                        <ClockCircleOutlined style={{ color: '#faad14', marginRight: 4 }} />{tripSummary.totalDriveTxt} drive
                      </Text>
                    )}
                    {!routeLegsLoading && tripSummary.totalTransitTxt && (
                      <Text style={{ fontSize: 12 }}>
                        <GlobalOutlined style={{ color: '#d48806', marginRight: 4 }} />{tripSummary.totalTransitTxt} transit
                      </Text>
                    )}
                    {tripSummary.totalMeetingTxt && (
                      <Text style={{ fontSize: 12 }}>
                        <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 4 }} />{tripSummary.totalMeetingTxt} meetings
                      </Text>
                    )}
                    {tripSummary.totalDaySec > 0 && (
                      <Tag
                        color={tripSummary.totalDaySec > 36000 ? 'error' : tripSummary.totalDaySec > 28800 ? 'warning' : 'success'}
                        style={{ fontSize: 12, margin: 0 }}
                      >
                        Full day: {tripSummary.totalDayTxt}
                      </Tag>
                    )}
                    {tripSummary.overrunTxt && (
                      <Tag color="error" style={{ fontSize: 12, margin: 0 }}>⚠ +{tripSummary.overrunTxt} overrun</Tag>
                    )}
                  </Space>
                  <Space size={6}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Buffer:</Text>
                    <InputNumber size="small" min={0} max={120} value={bufferMins} onChange={v => setBufferMins(v ?? 15)} suffix="min" style={{ width: 78 }} />
                    <Tooltip title="Auto-set visit times for empty slots, chained from the first stop that has a time, using drive + buffer.">
                      <Button size="small" icon={<ThunderboltOutlined />} onClick={autoFillTimes}>Auto-fill</Button>
                    </Tooltip>
                  </Space>
                </div>
              )}

              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="planner-stops">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {stops.map((stop, idx) => {
                        const stopKey = stop.id || stop.local_id || `tmp-${idx}`;
                        const brief = briefByStop[stopKey];
                        const briefLoading = !!briefLoadingByStop[stopKey];
                        const color = STOP_COLORS[stop.stop_type] || STOP_COLORS.other;
                        const entityName = stop.customer_id && customerMap.has(stop.customer_id) ? customerMap.get(stop.customer_id).label
                          : stop.prospect_id && prospectMap.has(stop.prospect_id) ? prospectMap.get(stop.prospect_id).label
                          : stop.address_snapshot || '';

                        // Country header: show when first stop or country changes from previous
                        const prevCountry = idx > 0 ? (stops[idx - 1].stop_country || '').trim().toLowerCase() : null;
                        const curCountry = (stop.stop_country || '').trim().toLowerCase();
                        const showCountryHeader = curCountry && (idx === 0 || curCountry !== prevCountry);

                        return (
                          <React.Fragment key={`frag-${stopKey}`}>
                          {showCountryHeader && (
                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', margin: idx > 0 ? '8px 0 4px' : '0 0 4px', background: 'linear-gradient(90deg,#e6f4ff 0%,transparent 100%)', borderRadius: 6, borderLeft: '3px solid #1677ff', cursor: 'pointer' }}
                              onClick={() => {
                                // Pan to first stop with coords in this country
                                const countryStop = stops.find(s => (s.stop_country || '').trim().toLowerCase() === curCountry && hasValidCoordinates(s.latitude, s.longitude));
                                if (countryStop && mapInstanceRef.current) {
                                  mapInstanceRef.current.panTo({ lat: Number(countryStop.latitude), lng: Number(countryStop.longitude) });
                                  mapInstanceRef.current.setZoom(12);
                                }
                              }}
                            >
                              <GlobalOutlined style={{ color: '#1677ff', fontSize: 13 }} />
                              <Text strong style={{ fontSize: 13, color: '#0958d9' }}>{resolveCountryName(stop.stop_country) || stop.stop_country}</Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                ({stops.filter(s => (s.stop_country || '').trim().toLowerCase() === curCountry).length} stop{stops.filter(s => (s.stop_country || '').trim().toLowerCase() === curCountry).length !== 1 ? 's' : ''})
                              </Text>
                            </div>
                          )}
                          <Draggable key={`stop-${stopKey}`} draggableId={`stop-${stopKey}`} index={idx}>
                            {(prov, snap) => (
                              <div ref={prov.innerRef} {...prov.draggableProps} style={{ marginBottom: 10, ...prov.draggableProps.style }}>
                                <Card
                                  size="small"
                                  style={{ borderLeft: `4px solid ${color}`, ...(snap.isDragging ? { boxShadow: '0 4px 16px rgba(0,0,0,.15)' } : {}) }}
                                  styles={{ body: { padding: '10px 14px' } }}
                                >
                                  {/* Stop header */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Space size={8}>
                                      <Tooltip title="Hold and drag to reorder">
                                        <span {...prov.dragHandleProps} style={{ cursor: 'grab', touchAction: 'none', padding: '0 4px' }}>
                                          <DragOutlined style={{ color: '#aaa', fontSize: 14 }} />
                                        </span>
                                      </Tooltip>
                                      <Badge count={idx + 1} style={{ backgroundColor: color }} />
                                      <Tag color={stop.stop_type === 'customer' ? 'blue' : stop.stop_type === 'location' ? 'green' : stop.stop_type === 'custom' ? 'default' : 'gold'} style={{ margin: 0 }}>
                                        {stop.stop_type === 'customer' ? 'Customer'
                                          : (stop.stop_type === 'location' || stop.stop_type === 'custom')
                                          ? (CUSTOM_STOP_LABELS.find(l => l.value === stop.custom_label)
                                            ? `${CUSTOM_STOP_LABELS.find(l => l.value === stop.custom_label).icon} ${CUSTOM_STOP_LABELS.find(l => l.value === stop.custom_label).label}`
                                            : '📍 Location')
                                          : 'Prospect/Lead'}
                                      </Tag>
                                      {(stop.stop_type === 'location' || stop.stop_type === 'custom') && (
                                        <select
                                          value={stop.custom_label || ''}
                                          onChange={e => updateStop(idx, { custom_label: e.target.value || null })}
                                          style={{ fontSize: 11, border: '1px solid #d9d9d9', borderRadius: 4, padding: '1px 4px', background: '#fff', cursor: 'pointer' }}
                                        >
                                          <option value="">— Type —</option>
                                          {CUSTOM_STOP_LABELS.map(l => <option key={l.value} value={l.value}>{l.icon} {l.label}</option>)}
                                        </select>
                                      )}
                                      {entityName && (
                                        <Tooltip title={hasValidCoordinates(stop.latitude, stop.longitude) ? 'Click to focus on map' : 'No coordinates yet'}>
                                          <Text
                                            ellipsis
                                            style={{ maxWidth: 200, fontSize: 12, cursor: hasValidCoordinates(stop.latitude, stop.longitude) ? 'pointer' : 'default', color: hasValidCoordinates(stop.latitude, stop.longitude) ? '#1677ff' : undefined }}
                                            onClick={() => {
                                              if (!hasValidCoordinates(stop.latitude, stop.longitude) || !mapInstanceRef.current) return;
                                              mapInstanceRef.current.panTo({ lat: Number(stop.latitude), lng: Number(stop.longitude) });
                                              mapInstanceRef.current.setZoom(15);
                                            }}
                                          >{entityName}</Text>
                                        </Tooltip>
                                      )}
                                    </Space>
                                    <Space size={2}>
                                      <Tooltip title="Move up"><Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveStop(idx, -1)} /></Tooltip>
                                      <Tooltip title="Move down"><Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={idx === stops.length - 1} onClick={() => moveStop(idx, 1)} /></Tooltip>
                                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeStop(idx)} />
                                    </Space>
                                  </div>

                                  {/* Country selector for location stops */}
                                  {(stop.stop_type === 'location' || stop.stop_type === 'custom') && (
                                    <div style={{ marginBottom: 8 }}>
                                      <Space size={8} wrap>
                                        <Text type="secondary" style={{ fontSize: 11 }}>Country:</Text>
                                        <select
                                          value={resolveCountryName(stop.stop_country) || stop.stop_country || ''}
                                          onChange={e => updateStop(idx, { stop_country: e.target.value || null })}
                                          style={{ fontSize: 11, border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 6px', background: '#fff', cursor: 'pointer', maxWidth: 200 }}
                                        >
                                          <option value="">— Select country —</option>
                                          {selectedCountryName && <option value={selectedCountryName}>{selectedCountryName}</option>}
                                          {(destinationCountryNames || []).filter(cn => cn !== selectedCountryName).map(cn => <option key={cn} value={cn}>{cn}</option>)}
                                        </select>
                                        {(() => {
                                          const sharedKey = buildSharedLocationKey(stop.stop_country, stop.custom_label || '');
                                          const sharedRows = sharedLocationsByKey[sharedKey] || [];
                                          const loadingShared = !!sharedLocationsLoadingByKey[sharedKey];
                                          return (
                                            <Select
                                              size="small"
                                              showSearch
                                              filterOption={false}
                                              value={undefined}
                                              placeholder={loadingShared ? 'Loading company locations…' : 'Company locations'}
                                              style={{ width: 280 }}
                                              notFoundContent={loadingShared ? 'Loading…' : 'No company locations yet'}
                                              options={sharedRows.map((row) => ({
                                                value: String(row.id),
                                                label: `${row.name}${row.city ? ` — ${row.city}` : ''} (${row.use_count || 0})`,
                                              }))}
                                              onOpenChange={(open) => {
                                                if (open && stop.stop_country) {
                                                  fetchSharedLocations({ countryName: stop.stop_country, label: stop.custom_label || '' });
                                                }
                                              }}
                                              onSearch={(value) => {
                                                if (!stop.stop_country) return;
                                                fetchSharedLocations({ countryName: stop.stop_country, label: stop.custom_label || '', query: value });
                                              }}
                                              onSelect={(value) => {
                                                const selected = sharedRows.find((row) => String(row.id) === String(value));
                                                if (selected) applySharedLocationToStop(idx, selected);
                                              }}
                                            />
                                          );
                                        })()}
                                        {stop.stop_country && (
                                          <Text type="secondary" style={{ fontSize: 11 }}>
                                            <EnvironmentOutlined /> Map search will be scoped to {resolveCountryName(stop.stop_country) || stop.stop_country}
                                          </Text>
                                        )}
                                      </Space>
                                    </div>
                                  )}

                                  {/* Date/time row */}
                                  <Space wrap size={8} style={{ marginBottom: 8 }}>
                                    <DatePicker
                                      size="small"
                                      placeholder="Date"
                                      value={stop.visit_date ? dayjs(stop.visit_date) : null}
                                      onChange={d => updateStop(idx, { visit_date: d ? d.format('YYYY-MM-DD') : null })}
                                      disabledDate={(current) => {
                                        if (!current) return false;
                                        const dep = savedDeparture ? dayjs(savedDeparture).startOf('day') : null;
                                        const ret = savedReturn ? dayjs(savedReturn).endOf('day') : null;
                                        if (dep && current.isBefore(dep)) return true;
                                        if (ret && current.isAfter(ret)) return true;
                                        return false;
                                      }}
                                    />
                                    <TimePicker size="small" placeholder="Time" format="HH:mm" value={stop.visit_time ? dayjs(`2000-01-01T${stop.visit_time}`) : null} onChange={t => updateStop(idx, { visit_time: t ? t.format('HH:mm:ss') : null })} />
                                    {stop.stop_type !== 'location' && (
                                      <InputNumber size="small" min={10} max={480} value={stop.duration_mins || 60} onChange={v => updateStop(idx, { duration_mins: v || 60 })} suffix="min" style={{ width: 100 }} />
                                    )}
                                    {idx > 0 && etaChain[idx]?.arrivalTxt && (
                                      <Tooltip title={etaChain[idx].isLate
                                        ? `Expected arrival ${etaChain[idx].arrivalTxt} — ${etaChain[idx].lateMins}min late vs scheduled`
                                        : `Expected arrival: ${etaChain[idx].arrivalTxt}`}>
                                        <Tag
                                          color={etaChain[idx].isLate ? 'red' : 'cyan'}
                                          style={{ fontSize: 11, marginInlineEnd: 0, cursor: 'default' }}
                                        >
                                          {etaChain[idx].isLate ? `⚠ ETA ${etaChain[idx].arrivalTxt}` : `→ ${etaChain[idx].arrivalTxt}`}
                                        </Tag>
                                      </Tooltip>
                                    )}
                                  </Space>

                                  {/* Contact — only for customer/prospect stops */}
                                  {stop.stop_type !== 'location' && (
                                    <Space wrap size={8} style={{ marginBottom: 8 }}>
                                      <Input size="small" placeholder="Meeting with" value={stop.contact_person || ''} onChange={e => updateStop(idx, { contact_person: e.target.value })} style={{ width: 150 }} />
                                      <Input size="small" placeholder="Phone" value={stop.contact_phone || ''} onChange={e => updateStop(idx, { contact_phone: e.target.value })} style={{ width: 130 }} />
                                      <Input size="small" placeholder="Email" value={stop.contact_email || ''} onChange={e => updateStop(idx, { contact_email: e.target.value })} style={{ width: 170 }} />
                                    </Space>
                                  )}

                                  {/* Notes / Objectives */}
                                  <Input.TextArea size="small" rows={1} placeholder={stop.stop_type === 'location' ? 'Notes (e.g. Terminal 3, Gate B12)' : 'Visit objectives'} value={stop.objectives || ''} onChange={e => updateStop(idx, { objectives: e.target.value })} style={{ marginBottom: 6 }} />

                                  {/* Pre-visit brief — only for customer/prospect stops */}
                                  <Space size={8}>
                                    {stop.stop_type !== 'location' && (
                                      <Button type="link" size="small" icon={<ClockCircleOutlined />} loading={briefLoading}
                                        disabled={!stop.customer_id && !stop.prospect_id}
                                        onClick={() => {
                                          const key = stop.id || stop.local_id || `tmp-${idx}`;
                                          if (briefByStop[key]) {
                                            setBriefByStop(prev => { const n = { ...prev }; delete n[key]; return n; });
                                          } else {
                                            loadPreVisitBrief(stop, idx);
                                          }
                                        }}>
                                        {briefByStop[stop.id || stop.local_id || `tmp-${idx}`] ? 'Hide Brief' : 'Pre-Visit Brief'}
                                      </Button>
                                    )}
                                    {hasValidCoordinates(stop.latitude, stop.longitude) ? (
                                      <Space size={6}>
                                        <Button
                                          type="link"
                                          size="small"
                                          icon={<AimOutlined />}
                                          style={{ fontSize: 11, padding: 0 }}
                                          onClick={() => {
                                            if (mapInstanceRef.current) {
                                              mapInstanceRef.current.panTo({ lat: Number(stop.latitude), lng: Number(stop.longitude) });
                                              mapInstanceRef.current.setZoom(14);
                                            }
                                          }}
                                        >
                                          {Number(stop.latitude).toFixed(3)}, {Number(stop.longitude).toFixed(3)}
                                        </Button>
                                        {stop.coordinates_persist_status === 'saved' && <Tag color="green" style={{ fontSize: 11, marginInlineEnd: 0 }}>Saved</Tag>}
                                        {stop.coordinates_persist_status === 'auto_resolved' && <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>Auto-resolved</Tag>}
                                        {stop.coordinates_persist_status === 'pending' && <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>Saving...</Tag>}
                                        {stop.coordinates_persist_status === 'failed' && <Tag color="red" style={{ fontSize: 11, marginInlineEnd: 0 }}>Not Saved</Tag>}
                                        <Button
                                          type={pinTargetIdx === idx ? 'primary' : 'link'}
                                          size="small"
                                          icon={<EnvironmentOutlined />}
                                          loading={savingLocationIdx === idx}
                                          onClick={() => {
                                            setPinTargetIdx(idx);
                                            setMapSearchQuery(stop.address_snapshot || entityName || '');
                                            setMapSearchResults([]);
                                            message.info(`Pin mode active for Stop #${idx + 1}. Search in the map panel${stop.stop_country ? ` (scoped to ${resolveCountryName(stop.stop_country) || stop.stop_country})` : ''} or click the map.`);
                                          }}
                                        >
                                          Adjust Pin
                                        </Button>
                                        <Button
                                          type="link"
                                          size="small"
                                          loading={savingLocationIdx === idx}
                                          onClick={() => {
                                            setGoogleUrlTargetIdx(idx);
                                            setGoogleMapsUrl('');
                                            setShowGoogleUrlModal(true);
                                          }}
                                        >
                                          Google URL
                                        </Button>
                                      </Space>
                                    ) : (
                                      <div style={{ marginTop: 6 }}>
                                        <Alert
                                          type="warning"
                                          showIcon
                                          style={{ padding: '4px 10px', fontSize: 12 }}
                                          message={
                                            <span>
                                              <strong>No location saved</strong> for this {stop.stop_type === 'customer' ? 'customer' : stop.stop_type === 'location' ? 'location' : 'prospect'}.
                                              {' '}Set it now:
                                              <Button
                                                type="primary"
                                                size="small"
                                                icon={<EnvironmentOutlined />}
                                                loading={savingLocationIdx === idx}
                                                style={{ marginLeft: 8, marginRight: 4 }}
                                                onClick={() => {
                                                  setPinTargetIdx(idx);
                                                  if (entityName) setMapSearchQuery(entityName);
                                                  message.info(`Pin mode enabled for Stop #${idx + 1}. Click a location on the map.`);
                                                }}
                                              >
                                                Pin On Map
                                              </Button>
                                              <Button
                                                size="small"
                                                loading={savingLocationIdx === idx}
                                                onClick={() => {
                                                  setGoogleUrlTargetIdx(idx);
                                                  setGoogleMapsUrl('');
                                                  setShowGoogleUrlModal(true);
                                                }}
                                              >
                                                Paste Google Maps Link
                                              </Button>
                                            </span>
                                          }
                                        />
                                      </div>
                                    )}
                                  </Space>

                                  {brief && (
                                    <div style={{ background: '#f6f8fa', borderRadius: 6, padding: '8px 12px', marginTop: 6, fontSize: 12 }}>
                                      <Text strong>{brief.type}: {brief.name}</Text>
                                      {brief.country && <Text type="secondary"> — {brief.country}</Text>}
                                      {brief.orders?.length > 0 && (
                                        <div style={{ marginTop: 4 }}>
                                          <Text type="secondary">Recent orders: </Text>
                                          {brief.orders.slice(0, 3).map((o, i) => (
                                            <Tag key={i} style={{ fontSize: 11 }}>{o.product_group || 'N/A'} {o.quantity_kgs || 0}kg</Tag>
                                          ))}
                                        </div>
                                      )}
                                      <Space style={{ marginTop: 4 }}>
                                        {brief.deals > 0 && <Tag color="purple">Active Deals: {brief.deals}</Tag>}
                                        {brief.note && <Text type="secondary" ellipsis style={{ maxWidth: 300 }}>Note: {brief.note}</Text>}
                                      </Space>
                                    </div>
                                  )}
                                </Card>
                              </div>
                            )}
                          </Draggable>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {idx < stops.length - 1 && (
                              <div style={{ flex: 1 }}>
                                <LegStrip
                                  leg={routeLegs[idx]}
                                  loading={routeLegsLoading}
                                  bufferMins={bufferMins}
                                  transportMode={stop.transport_to_next}
                                  onTransportChange={(mode) => updateStop(idx, { transport_to_next: mode })}
                                />
                              </div>
                            )}
                            <Tooltip title={idx < stops.length - 1 ? 'Insert location stop here' : 'Add location stop at end'}>
                              <Button
                                type="text"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => insertCustomStopAfter(idx)}
                                style={{ color: '#8c8c8c', fontSize: 11, padding: '0 4px' }}
                              />
                            </Tooltip>
                          </div>
                          </React.Fragment>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

            </Card>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <Button onClick={() => setStep(0)}><ArrowLeftOutlined /> Back</Button>
              <Space>
                <Button
                  icon={<SaveOutlined />}
                  loading={autoSaveStatus === 'saving'}
                  onClick={async () => { await autoSaveTrip(); }}
                >
                  Save Draft
                </Button>
                <Button type="primary" onClick={async () => {
                  if (stops.length === 0) { message.warning('Add at least one stop.'); return; }
                  if (!validateStops()) return;
                  await autoSaveTrip();
                  setStep(2);
                }}>
                  Next: Review <SwapOutlined />
                </Button>
              </Space>
            </div>
          </Col>

          {/* Right: Map Preview */}
          <FieldVisitPlannerMapPanel
            isMobile={isMobile}
            isMapFullscreen={isMapFullscreen}
            mapCardWrapRef={mapCardWrapRef}
            mapSearchScopeCountry={mapSearchScopeCountry}
            mapSearchQuery={mapSearchQuery}
            setMapSearchQuery={setMapSearchQuery}
            mapSearching={mapSearching}
            searchMapPlaces={searchMapPlaces}
            toggleMapFullscreen={toggleMapFullscreen}
            mapSearchResults={mapSearchResults}
            setMapSearchResults={setMapSearchResults}
            centerMapOnSearchResult={centerMapOnSearchResult}
            pinTargetIdx={pinTargetIdx}
            applyCoordinatesToStop={applyCoordinatesToStop}
            addSearchResultAsStop={addSearchResultAsStop}
            setPinTargetIdx={setPinTargetIdx}
            mapContainerRef={mapContainerRef}
            mapReady={mapReady}
          />
        </Row>
      )}

      {/* ============ STEP 2: Review & Save ============ */}
      {step === 2 && (
        <FieldVisitReviewStep
          form={form}
          countries={countries}
          parseTransportMode={parseTransportMode}
          serializeTransportMode={serializeTransportMode}
          transportOptions={TRANSPORT_OPTIONS}
          routeGeoSummary={routeGeoSummary}
          stops={stops}
          reviewRouteFlow={reviewRouteFlow}
          reviewTripHealth={reviewTripHealth}
          reviewMapStops={reviewMapStops}
          etaChain={etaChain}
          reviewShowUnsavedOnly={reviewShowUnsavedOnly}
          setReviewShowUnsavedOnly={setReviewShowUnsavedOnly}
          unresolvedGpsCount={unresolvedGpsCount}
          routeLegs={routeLegs}
          customerMap={customerMap}
          prospectMap={prospectMap}
          resolveCountryName={resolveCountryName}
          customStopLabels={CUSTOM_STOP_LABELS}
          stopColors={STOP_COLORS}
          interStopTransport={INTER_STOP_TRANSPORT}
          hasResolvedStopCoordinates={hasResolvedStopCoordinates}
          saving={saving}
          onSave={onSave}
          onBackToStops={() => setStep(1)}
          isMobile={isMobile}
          fmtDuration={fmtDuration}
        />
      )}

      {/* ============ Draft Modal ============ */}
      <Modal
        title={draftModalType === 'customers' ? 'Draft Stops from Customers' : 'Draft Stops from Prospects'}
        open={Boolean(draftModalType)}
        onCancel={() => { setDraftModalType(null); setDraftSelection([]); }}
        onOk={addDraftStops}
        okText="Add Selected"
        width={560}
      >
        <div style={{ marginBottom: 12 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 13 }}>Filter by Country</Text>
            <Space><Text type="secondary" style={{ fontSize: 12 }}>Show all</Text><Switch size="small" checked={!draftCountryScoped} onChange={v => setDraftCountryScoped(!v)} /></Space>
          </Space>
          {draftCountryScoped && (
            <Select
              style={{ width: '100%' }}
              size="small"
              value={draftCountryFilter}
              onChange={v => { setDraftCountryFilter(v); setDraftSelection([]); }}
              showSearch
              optionFilterProp="label"
              options={destinationCountryNames.map(name => ({ value: name, label: name }))}
              placeholder="Select destination country"
            />
          )}
        </div>
        <Select
          mode="multiple" style={{ width: '100%' }} placeholder="Search and select..." showSearch
          value={draftSelection} onChange={setDraftSelection}
          options={draftOptions} optionFilterProp="label"
        />
        {draftCountryScoped && filteredCustomers.length === 0 && filteredProspects.length === 0 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            No {draftModalType} found for "{draftCountryFilter}". Try "Show all" or check that customers have the correct country assigned.
          </Text>
        )}
      </Modal>

      {/* ============ New Lead Modal ============ */}
      <Modal
        title={<Space><UserAddOutlined /> Add New Lead</Space>}
        open={showNewProspect}
        onCancel={() => { setShowNewProspect(false); prospectForm.resetFields(); }}
        onOk={handleCreateProspect}
        confirmLoading={savingProspect}
        okText="Create & Add as Stop"
      >
        <Form form={prospectForm} layout="vertical" initialValues={{ country: draftCountryFilter || (destinationCountryNames.length === 1 ? destinationCountryNames[0] : undefined) }}>
          <Form.Item name="customer_name" label="Company Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Acme Foods Ltd." />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="country" label="Country" rules={[{ required: true, message: 'Required' }]}>
                <Select showSearch allowClear placeholder="Country" optionFilterProp="label"
                  options={destinationCountryNames.map(name => ({ value: name, label: name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="city" label="City"><Input placeholder="Dubai" /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} placeholder="Initial notes..." /></Form.Item>
        </Form>
      </Modal>

      {/* Geocode Modal */}
      <Modal title="Find Address" open={showGeocodeModal} onCancel={() => setShowGeocodeModal(false)} footer={null} width={500}>
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Input value={geocodeQuery} onChange={e => setGeocodeQuery(e.target.value)} placeholder="Type address or city name" onPressEnter={() => geocodeAddress(geocodeQuery)} />
          <Button type="primary" onClick={() => geocodeAddress(geocodeQuery)}>Search</Button>
        </Space.Compact>
        {geocodeResults.length > 0 && geocodeResults.map((r, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }} onClick={() => { applyGeocode(r); setShowGeocodeModal(false); }}>
            <Text strong>{r.display_name}</Text>
            <br /><Text type="secondary" style={{ fontSize: 11 }}>Lat: {r.lat}, Lng: {r.lng}</Text>
          </div>
        ))}
      </Modal>

      {/* Google URL Pin Modal */}
      <Modal
        title="Set Coordinates From Google Maps URL"
        open={showGoogleUrlModal}
        onCancel={() => { setShowGoogleUrlModal(false); setGoogleUrlTargetIdx(null); setGoogleMapsUrl(''); }}
        onOk={resolveGoogleUrlForStop}
        okText="Apply Coordinates"
        okButtonProps={{ disabled: !googleMapsUrl.trim() || googleUrlTargetIdx === null }}
      >
        <Input
          placeholder="Paste Google Maps link"
          value={googleMapsUrl}
          allowClear
          onChange={(e) => setGoogleMapsUrl(e.target.value)}
        />
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          Parsed coordinates are applied to the selected stop and persisted to the linked customer/prospect when possible.
        </Text>
      </Modal>

      {/* Load Previous Trip Modal */}
      <Modal title="Load from Previous Trips" open={showPrevTripsModal} onCancel={() => setShowPrevTripsModal(false)} footer={null} width={640}>
        {prevTripsLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Text type="secondary">Loading trips…</Text></div>
        ) : prevTrips.length === 0 ? (
          <Text type="secondary">No previous trips found.</Text>
        ) : (
          <div style={{ maxHeight: 450, overflowY: 'auto' }}>
            {prevTrips.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong>{t.title || `Trip #${t.id}`}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t.trip_type === 'international' ? 'International' : 'Local'}
                    {t.country ? ` · ${t.country}` : ''}
                    {t.departure_date ? ` · ${dayjs(t.departure_date).format('DD MMM YYYY')}` : ''}
                    {t.stop_count ? ` · ${t.stop_count} stop${t.stop_count !== 1 ? 's' : ''}` : ''}
                  </Text>
                </div>
                <Space size={6}>
                  <Tag color={t.status === 'draft' ? 'orange' : t.status === 'completed' ? 'green' : t.status === 'cancelled' ? 'red' : 'blue'} style={{ marginInlineEnd: 0 }}>
                    {t.status || 'planning'}
                  </Tag>
                  <Button size="small" type="primary" onClick={() => cloneFromTrip(t.id)}>
                    Duplicate
                  </Button>
                  <Popconfirm
                    title="Delete this trip?"
                    description="This cannot be undone."
                    onConfirm={async () => {
                      try {
                        await axios.delete(`${API_BASE}/api/crm/field-trips/${t.id}`, { headers: getAuthHeaders() });
                        setPrevTrips(prev => prev.filter(p => p.id !== t.id));
                        if (editingTripIdRef.current === t.id) { setEditingTripId(null); }
                        message.success('Trip deleted');
                      } catch { message.error('Failed to delete trip'); }
                    }}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default FieldVisitPlanner;
