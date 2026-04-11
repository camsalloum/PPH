import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF, InfoWindowF, useJsApiLoader } from '@react-google-maps/api';
import axios from 'axios';
import { Button, Segmented, Slider, Space, Spin, Switch, Tag, Typography } from 'antd';
import { hasValidCoordinates, GMAP_LIBRARIES, API_BASE, getAuthHeaders, STOP_COLORS as COLORS, toNumber, formatDuration, formatDistanceKm, sanitizeLocationLabel } from './fieldVisitUtils';

const { Text } = Typography;
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

const escapeXml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const getStopDisplayName = (stop, idx) => {
  const raw = stop.customer_name || stop.prospect_name || stop.address_snapshot || `Stop ${idx + 1}`;
  const clean = sanitizeLocationLabel(String(raw).split(',')[0].trim());
  return clean.length > 30 ? `${clean.slice(0, 30)}...` : clean;
};

const makeStopMarkerSvg = ({ color, seq, label, showLabel }) => {
  if (!showLabel) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="${color}" stroke="white" stroke-width="2"/><text x="15" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="Arial">${escapeXml(seq)}</text></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="42" viewBox="0 0 260 42"><g><circle cx="15" cy="21" r="14" fill="${color}" stroke="white" stroke-width="2"/><text x="15" y="26" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="Arial">${escapeXml(seq)}</text></g><rect x="34" y="9" rx="8" ry="8" width="220" height="24" fill="white" opacity="0.94"/><text x="42" y="25" fill="#1f2937" font-size="12" font-family="Arial" font-weight="600">${escapeXml(label)}</text></svg>`;
};

/* ---------- geodesic arc helper (great-circle interpolation) ---------- */
const haversineDist = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const zoomForDistance = (km) => {
  if (km < 1) return 17;
  if (km < 3) return 15;
  if (km < 8) return 13;
  if (km < 20) return 12;
  if (km < 50) return 10;
  if (km < 150) return 9;
  if (km < 400) return 7;
  if (km < 1000) return 6;
  return 5;
};

/* Close-up zoom level when paused at a stop/customer */
const STOP_ZOOM = 17;
const MAP_TYPE_OPTIONS = [
  { value: 'roadmap', label: 'Roadmap' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'hybrid', label: 'Hybrid' },
];

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

const generateGeodesicArc = (from, to, numPoints = 50) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat), lng1 = toRad(from.lng);
  const lat2 = toRad(to.lat), lng2 = toRad(to.lng);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat1 - lat2) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng1 - lng2) / 2) ** 2
  ));
  if (d < 1e-8) return [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }];
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push({ lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), lng: toDeg(Math.atan2(y, x)) });
  }
  return points;
};

const FieldVisitMap = ({
  stops = [],
  routeLineVisible = true,
  onOpenStop,
  height = 460,
}) => {
  const wrapperRef = useRef(null);
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GMAP_LIBRARIES,
    language: 'en',
    version: 'weekly',
  });
  const googleMapRef = useRef(null);
  const routeReqSeqRef = useRef(0);
  const flyoverTimersRef = useRef([]);
  const flyoverRunIdRef = useRef(0);
  const flyoverRafRef = useRef(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [routeSegments, setRouteSegments] = useState([]);
  const [flyoverRunning, setFlyoverRunning] = useState(false);
  const [activeFlyoverStopIdx, setActiveFlyoverStopIdx] = useState(-1);
  const [routeProgressPct, setRouteProgressPct] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [mapType, setMapType] = useState('roadmap');
  const [enable3D, setEnable3D] = useState(false);

  const geoStops = useMemo(
    () => stops
      .map((s) => ({ ...s, lat: toNumber(s.latitude), lng: toNumber(s.longitude) }))
      .filter((s) => hasValidCoordinates(s.lat, s.lng)),
    [stops]
  );

  const clearFlyoverTimers = () => {
    flyoverTimersRef.current.forEach((t) => clearTimeout(t));
    flyoverTimersRef.current = [];
    if (flyoverRafRef.current) {
      cancelAnimationFrame(flyoverRafRef.current);
      flyoverRafRef.current = null;
    }
  };

  const exitFullscreenMode = () => {
    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      setIsFullscreen(false);
      return;
    }
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (typeof document.webkitExitFullscreen === 'function') {
      document.webkitExitFullscreen();
      return;
    }
    if (typeof document.msExitFullscreen === 'function') {
      document.msExitFullscreen();
    }
  };

  const enterFullscreenMode = () => {
    if (!wrapperRef.current) return;
    const element = wrapperRef.current;
    if (typeof element.requestFullscreen === 'function') {
      element.requestFullscreen().catch(() => {
        setIsPseudoFullscreen(true);
        setIsFullscreen(true);
      });
      return;
    }
    if (typeof element.webkitRequestFullscreen === 'function') {
      element.webkitRequestFullscreen();
      return;
    }
    if (typeof element.msRequestFullscreen === 'function') {
      element.msRequestFullscreen();
      return;
    }

    setIsPseudoFullscreen(true);
    setIsFullscreen(true);
  };

  // Fit map to stops whenever they change (skip if flyover is running)
  useEffect(() => {
    if (!googleMapRef.current || !isLoaded || geoStops.length === 0 || flyoverRunning) return;
    const fitMap = () => {
      if (!googleMapRef.current || flyoverRunning) return;
      window.google.maps.event.trigger(googleMapRef.current, 'resize');
      if (geoStops.length === 1) {
        googleMapRef.current.moveCamera({ center: { lat: geoStops[0].lat, lng: geoStops[0].lng }, zoom: 13 });
      } else {
        const bounds = new window.google.maps.LatLngBounds();
        geoStops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
        googleMapRef.current.fitBounds(bounds, 40);
      }
    };
    fitMap();
    const t1 = setTimeout(fitMap, 150);
    const t2 = setTimeout(fitMap, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [geoStops, isLoaded, flyoverRunning]);

  // Build transport-aware route plan: group consecutive driving stops, isolate flight legs
  const routePlan = useMemo(() => {
    if (geoStops.length < 2) return [];
    const segments = [];
    let driveWpts = [geoStops[0]];
    for (let i = 0; i < geoStops.length - 1; i++) {
      if (geoStops[i].transport_to_next === 'flight') {
        if (driveWpts.length >= 2) segments.push({ type: 'drive', waypoints: driveWpts });
        segments.push({ type: 'flight', waypoints: [geoStops[i], geoStops[i + 1]] });
        driveWpts = [geoStops[i + 1]];
      } else {
        driveWpts.push(geoStops[i + 1]);
      }
    }
    if (driveWpts.length >= 2) segments.push({ type: 'drive', waypoints: driveWpts });
    return segments;
  }, [geoStops]);

  // Fetch route geometry per segment (road API for driving, geodesic arc for flights)
  useEffect(() => {
    if (!routeLineVisible || routePlan.length === 0) {
      setRouteSegments([]);
      return;
    }
    const seq = ++routeReqSeqRef.current;
    Promise.all(
      routePlan.map((seg) => {
        if (seg.type === 'flight') {
          const pts = generateGeodesicArc(seg.waypoints[0], seg.waypoints[1]);
          return Promise.resolve({ type: 'flight', latlngs: pts, meta: { source: 'flight', distanceM: 0, durationS: 0, fallback: false } });
        }
        const coordinates = seg.waypoints.map((s) => `${s.lng},${s.lat}`).join(';');
        return axios
          .get(`${API_BASE}/api/crm/field-trips/route-geometry`, {
            headers: getAuthHeaders(),
            params: { coordinates },
          })
          .then((res) => {
            const lls = res.data?.data?.latlngs;
            return {
              type: 'drive',
              latlngs: Array.isArray(lls) && lls.length >= 2
                ? lls.map(([lat, lng]) => ({ lat, lng }))
                : seg.waypoints.map((s) => ({ lat: s.lat, lng: s.lng })),
              meta: {
                distanceM: Number(res.data?.data?.distance_m) || 0,
                durationS: Number(res.data?.data?.duration_s) || 0,
                source: res.data?.data?.source || 'direct',
                fallback: Boolean(res.data?.data?.fallback),
              },
            };
          })
          .catch(() => ({
            type: 'drive',
            latlngs: seg.waypoints.map((s) => ({ lat: s.lat, lng: s.lng })),
            meta: { distanceM: 0, durationS: 0, source: 'direct', fallback: true },
          }));
      })
    ).then((results) => {
      if (seq !== routeReqSeqRef.current) return;
      setRouteSegments(results);
    });
  }, [routePlan, routeLineVisible]);

  useEffect(() => () => clearFlyoverTimers(), []);

  useEffect(() => {
    const onFullscreenChange = () => {
      const wrapperEl = wrapperRef.current;
      const activeFullscreenEl = document.fullscreenElement;
      const nowFS = Boolean(wrapperEl && activeFullscreenEl && (activeFullscreenEl === wrapperEl || wrapperEl.contains(activeFullscreenEl)));
      setIsFullscreen(nowFS);
      if (googleMapRef.current) {
        setTimeout(() => {
          if (!googleMapRef.current) return;
          window.google.maps.event.trigger(googleMapRef.current, 'resize');
        }, 80);
        setTimeout(() => {
          if (!googleMapRef.current) return;
          window.google.maps.event.trigger(googleMapRef.current, 'resize');
        }, 300);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!googleMapRef.current || !isLoaded) return;
    try {
      googleMapRef.current.setMapTypeId(mapType);
      if (enable3D && (mapType === 'satellite' || mapType === 'hybrid')) {
        googleMapRef.current.setTilt(45);
        googleMapRef.current.setHeading(0);
      } else {
        googleMapRef.current.setTilt(0);
      }
    } catch (_) {
      // Non-blocking: some browsers/zoom levels don't support tilt/heading.
    }
  }, [mapType, enable3D, isLoaded]);

  // Derived helpers for overlay and flyover
  const allRoutePoints = useMemo(() => routeSegments.flatMap((s) => s.latlngs), [routeSegments]);
  const routeScrubPoints = useMemo(
    () => (allRoutePoints.length >= 2 ? allRoutePoints : geoStops.map((s) => ({ lat: s.lat, lng: s.lng }))),
    [allRoutePoints, geoStops]
  );

  const stopPointIndices = useMemo(() => {
    if (routeScrubPoints.length < 2 || geoStops.length === 0) return [];
    return geoStops.map((stop) => {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      routeScrubPoints.forEach((point, idx) => {
        const dLat = point.lat - stop.lat;
        const dLng = point.lng - stop.lng;
        const dist = (dLat * dLat) + (dLng * dLng);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = idx;
        }
      });
      return nearestIdx;
    });
  }, [geoStops, routeScrubPoints]);

  /* Deduplicate consecutive stops at the same location (< 0.3 km apart).
     Merge them into one flyover waypoint so we don't zoom-in/zoom-out/fly-zero-distance. */
  const flyoverStops = useMemo(() => {
    if (geoStops.length === 0) return [];
    const merged = [{ ...geoStops[0], _srcIndices: [0] }];
    for (let i = 1; i < geoStops.length; i++) {
      const prev = merged[merged.length - 1];
      const cur = geoStops[i];
      if (haversineDist(prev, cur) < 0.3) {
        prev._srcIndices.push(i);
      } else {
        merged.push({ ...cur, _srcIndices: [i] });
      }
    }
    return merged;
  }, [geoStops]);

  const flyoverLegs = useMemo(() => {
    if (flyoverStops.length < 2) return [];
    const legs = [];
    for (let i = 0; i < flyoverStops.length - 1; i++) {
      const from = flyoverStops[i];
      const to = flyoverStops[i + 1];
      const fromGeoIdx = from._srcIndices[0];
      const toGeoIdx = to._srcIndices[0];
      const fromRouteIdx = stopPointIndices[fromGeoIdx] ?? 0;
      const toRouteIdx = stopPointIndices[toGeoIdx] ?? (routeScrubPoints.length - 1);
      let points = [];

      if (routeScrubPoints.length >= 2 && fromRouteIdx !== toRouteIdx) {
        const start = Math.min(fromRouteIdx, toRouteIdx);
        const end = Math.max(fromRouteIdx, toRouteIdx);
        points = routeScrubPoints.slice(start, end + 1);
        if (fromRouteIdx > toRouteIdx) points.reverse();
      }

      if (points.length < 2) {
        points = [];
        const samples = 24;
        for (let s = 0; s <= samples; s++) {
          const t = s / samples;
          points.push({
            lat: from.lat + ((to.lat - from.lat) * t),
            lng: from.lng + ((to.lng - from.lng) * t),
          });
        }
      }

      legs.push({ fromIdx: i, toIdx: i + 1, points, fromGeoIdx, toGeoIdx });
    }
    return legs;
  }, [flyoverStops, routeScrubPoints, stopPointIndices]);

  const hasFlightLeg = routeSegments.some((s) => s.type === 'flight');
  const driveMeta = useMemo(() => {
    const drives = routeSegments.filter((s) => s.type === 'drive');
    return {
      distanceM: drives.reduce((sum, d) => sum + (d.meta.distanceM || 0), 0),
      durationS: drives.reduce((sum, d) => sum + (d.meta.durationS || 0), 0),
      source: drives.some((d) => d.meta.source === 'osrm' && !d.meta.fallback) ? 'osrm' : 'direct',
      fallback: drives.length > 0 && drives.every((d) => d.meta.fallback),
    };
  }, [routeSegments]);

  const runFlyover = () => {
    if (!googleMapRef.current || flyoverStops.length < 2) return;
    clearFlyoverTimers();
    const runId = ++flyoverRunIdRef.current;
    setFlyoverRunning(true);
    setSelectedStop(null);

    const stopPauseMs = 2200;
    const totalStops = flyoverStops.length;

    const wait = (ms) => new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      flyoverTimersRef.current.push(t);
    });

    /* Single unified animation per leg.
       Zoom profile: STOP_ZOOM → transitZoom → STOP_ZOOM
       Uses a bell-curve zoom envelope so zoom changes are smooth,
       and everything goes through one moveCamera call per frame. */
    const animateLeg = (leg, durationMs, transitZoom) => new Promise((resolve) => {
      const map = googleMapRef.current;
      const points = leg.points;
      const n = points.length - 1;
      if (n <= 0) { resolve(); return; }
      const startTime = performance.now();

      const tick = (now) => {
        try {
        if (flyoverRunIdRef.current !== runId || !map) { resolve(); return; }
        const elapsed = now - startTime;
        const rawT = Math.min(1, elapsed / durationMs);
        const easedT = easeInOutCubic(rawT);

        // Position along route
        const pos = easedT * n;
        const i0 = Math.floor(pos);
        const i1 = Math.min(n, i0 + 1);
        const frac = pos - i0;
        const p0 = points[i0];
        const p1 = points[i1] || p0;
        if (!p0) { resolve(); return; }

        // Smooth bell-curve zoom: start at STOP_ZOOM → dip to transitZoom at midpoint → return to STOP_ZOOM
        // Using sin curve for smooth envelope
        const zoomDip = Math.sin(rawT * Math.PI); // 0 at start/end, 1 at midpoint
        const zoom = STOP_ZOOM + (transitZoom - STOP_ZOOM) * zoomDip;

        map.moveCamera({
          center: {
            lat: p0.lat + (p1.lat - p0.lat) * frac,
            lng: p0.lng + (p1.lng - p0.lng) * frac,
          },
          zoom,
        });

        // Progress tracking
        const legProgress = leg.fromIdx + rawT;
        setRouteProgressPct((legProgress / (totalStops - 1)) * 100);

        if (rawT >= 1) { resolve(); return; }
        flyoverRafRef.current = requestAnimationFrame(tick);
        } catch (_e) { resolve(); }
      };

      flyoverRafRef.current = requestAnimationFrame(tick);
    });

    (async () => {
      try {
      const map = googleMapRef.current;
      const first = flyoverStops[0];

      // Start zoomed in at first stop
      setActiveFlyoverStopIdx(first._srcIndices[0]);
      setRouteProgressPct(0);
      map.moveCamera({ center: { lat: first.lat, lng: first.lng }, zoom: STOP_ZOOM });
      await wait(stopPauseMs);
      if (flyoverRunIdRef.current !== runId) return;

      for (const leg of flyoverLegs) {
        const from = flyoverStops[leg.fromIdx];
        const to = flyoverStops[leg.toIdx];
        if (!from || !to) continue; // safety: skip broken legs
        const km = haversineDist(from, to);
        const transitZoom = zoomForDistance(km);

        setActiveFlyoverStopIdx(-1); // between stops

        // Duration scales with distance: short legs are fast, long legs cap out
        const legDuration = Math.max(2500, Math.min(5500, km * 10 + 1500));

        await animateLeg(leg, legDuration, transitZoom);
        if (flyoverRunIdRef.current !== runId) return;

        // Arrived at stop — show label for all merged indices
        setActiveFlyoverStopIdx(to._srcIndices[0]);
        setRouteProgressPct((leg.toIdx / (totalStops - 1)) * 100);
        await wait(stopPauseMs);
        if (flyoverRunIdRef.current !== runId) return;
      }
      } catch (e) {
        console.warn('[Flyover] animation error, completing gracefully:', e);
      } finally {
        setFlyoverRunning(false);
        setRouteProgressPct(100);
      }
    })();
  };

  const stopFlyover = (options = {}) => {
    const { exitFullscreen = true } = options;
    flyoverRunIdRef.current += 1;
    clearFlyoverTimers();
    setFlyoverRunning(false);
    setActiveFlyoverStopIdx(-1);
    if (exitFullscreen) exitFullscreenMode();
  };

  /* Scrubber effect — only runs when user drags the slider (flyover already stopped).
     Uses moveCamera for a single-frame update (no flicker). Zoom adapts to how
     close the scrubbed position is to a stop: closer → more zoomed in. */
  useEffect(() => {
    if (!googleMapRef.current || routeScrubPoints.length < 2 || flyoverRunning) return;
    const idx = Math.round((routeProgressPct / 100) * (routeScrubPoints.length - 1));
    const point = routeScrubPoints[idx];
    if (!point) return;

    // Find nearest stop and distance to it
    let nearestStop = -1;
    let nearestDiff = Infinity;
    if (stopPointIndices.length > 0) {
      stopPointIndices.forEach((stopIdxPoint, stopIdx) => {
        const diff = Math.abs(stopIdxPoint - idx);
        if (diff < nearestDiff) {
          nearestDiff = diff;
          nearestStop = stopIdx;
        }
      });
    }

    // Zoom: close to a stop → zoom in more, in between → zoom out
    const nearThreshold = Math.max(3, routeScrubPoints.length * 0.02);
    const isNearStop = nearestDiff <= nearThreshold;
    const zoom = isNearStop ? STOP_ZOOM : 10;

    googleMapRef.current.moveCamera({ center: point, zoom });
    setActiveFlyoverStopIdx(nearestDiff <= 2 ? nearestStop : -1);
  }, [routeProgressPct, routeScrubPoints, stopPointIndices, flyoverRunning]);

  const routeDistanceTxt = formatDistanceKm(driveMeta.distanceM);
  const routeDurationTxt = driveMeta.durationS > 0 ? formatDuration(driveMeta.durationS) : null;
  const routeSourceTxt = hasFlightLeg
    ? (driveMeta.distanceM > 0 ? 'Road + Flight' : 'Flight route')
    : driveMeta.source === 'osrm' && !driveMeta.fallback ? 'Road route' : 'Direct path';

  /* Precompute marker position offsets for co-located stops (same lat/lng within ~30m).
     Fans them out in a small circle so they don't stack on top of each other. */
  const markerPositions = useMemo(() => {
    const positions = geoStops.map((s) => ({ lat: s.lat, lng: s.lng }));
    const groups = new Map(); // key → [indices]
    geoStops.forEach((s, i) => {
      // Quantize to ~30m grid for grouping
      const key = `${Math.round(s.lat * 3000)}:${Math.round(s.lng * 3000)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    groups.forEach((indices) => {
      if (indices.length < 2) return;
      indices.forEach((idx, rank) => {
        const angle = (2 * Math.PI * rank) / indices.length;
        const offset = 0.00035; // ~38m spread
        positions[idx] = {
          lat: geoStops[idx].lat + Math.cos(angle) * offset,
          lng: geoStops[idx].lng + Math.sin(angle) * offset,
        };
      });
    });
    return positions;
  }, [geoStops]);

  /* During flyover, determine which geoStop indices should show an expanded label.
     For merged stops, all source indices in the group light up together. */
  const activeFlyoverGeoIndices = useMemo(() => {
    if (activeFlyoverStopIdx < 0 || !flyoverRunning) return new Set();
    const group = flyoverStops.find((fs) => fs._srcIndices.includes(activeFlyoverStopIdx));
    return new Set(group ? group._srcIndices : [activeFlyoverStopIdx]);
  }, [activeFlyoverStopIdx, flyoverRunning, flyoverStops]);

  if (loadError) return <Text type="danger">Failed to load Google Maps.</Text>;
  if (!isLoaded) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
        <Spin />
        <Text type="secondary" style={{ fontSize: 12 }}>Loading map…</Text>
      </div>
    );
  }

  const mapHeight = (isFullscreen || isPseudoFullscreen) ? '100vh' : height;

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        background: '#fff',
        ...((isFullscreen || isPseudoFullscreen) ? { width: '100vw', height: '100vh' } : {}),
        ...(isPseudoFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999 } : {}),
      }}
    >
      <GoogleMap
        mapContainerStyle={{ height: mapHeight, width: '100%', borderRadius: isFullscreen ? 0 : 10, border: isFullscreen ? 'none' : '1px solid #e8e8e8' }}
        defaultCenter={{ lat: 24.453884, lng: 54.377344 }}
        defaultZoom={5}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'cooperative',
        }}
        onLoad={(m) => {
          googleMapRef.current = m;
          // Trigger resize so the map knows its container dimensions
          setTimeout(() => {
            window.google.maps.event.trigger(m, 'resize');
            if (geoStops.length === 1) {
              m.panTo({ lat: geoStops[0].lat, lng: geoStops[0].lng });
              m.setZoom(13);
            } else if (geoStops.length > 1) {
              const bounds = new window.google.maps.LatLngBounds();
              geoStops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
              m.fitBounds(bounds, 40);
            }
          }, 100);
        }}
      >
        {geoStops.map((s, idx) => {
          const color = COLORS[s.stop_type] || COLORS.other;
          const showLabel = activeFlyoverGeoIndices.has(idx);
          const markerSvg = makeStopMarkerSvg({
            color,
            seq: s.stop_order || idx + 1,
            label: getStopDisplayName(s, idx),
            showLabel,
          });
          const svgNum = encodeURIComponent(
            markerSvg
          );
          const pos = markerPositions[idx] || { lat: s.lat, lng: s.lng };
          return (
            <MarkerF
              key={`${s.lat}-${s.lng}-${idx}`}
              position={pos}
              title={s.customer_name || s.prospect_name || s.address_snapshot || `Stop ${idx + 1}`}
              icon={{
                url: `data:image/svg+xml;charset=UTF-8,${svgNum}`,
                scaledSize: new window.google.maps.Size(showLabel ? 260 : 30, showLabel ? 42 : 30),
                anchor: new window.google.maps.Point(15, showLabel ? 21 : 15),
              }}
              onClick={() =>
                setSelectedStop(
                  selectedStop?.lat === s.lat && selectedStop?.lng === s.lng ? null : s
                )
              }
            />
          );
        })}

        {selectedStop && (
          <InfoWindowF
            position={{ lat: selectedStop.lat, lng: selectedStop.lng }}
            onCloseClick={() => setSelectedStop(null)}
          >
            <div style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                #{selectedStop.stop_order || '-'}{' '}
                {selectedStop.customer_name ||
                  selectedStop.prospect_name ||
                  selectedStop.address_snapshot ||
                  'Stop'}
              </div>
              <div style={{ fontSize: 12, color: '#595959' }}>
                {(selectedStop.stop_type || 'other')} | {selectedStop.visit_date || 'Date TBD'}
              </div>
              {selectedStop.objectives && (
                <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>
                  {selectedStop.objectives}
                </div>
              )}
              {(selectedStop.customer_id || selectedStop.prospect_id) && (
                <div
                  style={{ fontSize: 12, color: '#1677ff', marginTop: 6, cursor: 'pointer', fontWeight: 500 }}
                  onClick={() => { onOpenStop?.(selectedStop); setSelectedStop(null); }}
                >
                  {selectedStop.customer_id ? 'Open Customer →' : 'Open Prospect →'}
                </div>
              )}
            </div>
          </InfoWindowF>
        )}

        {routeSegments.map((seg, idx) =>
          seg.latlngs.length >= 2 && (
            <PolylineF
              key={`route-seg-${idx}`}
              path={seg.latlngs}
              options={
                seg.type === 'flight'
                  ? {
                      strokeColor: '#ff6b35',
                      strokeOpacity: 0,
                      icons: [{
                        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
                        offset: '0',
                        repeat: '15px',
                      }],
                    }
                  : { strokeColor: '#1677ff', strokeWeight: 3, strokeOpacity: 0.75 }
              }
            />
          )
        )}
      </GoogleMap>

      {geoStops.length >= 2 && (
        <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(15,23,42,0.86)', color: '#fff', borderRadius: 10, padding: '6px 8px', maxWidth: isFullscreen ? 'calc(100vw - 20px)' : 'calc(100% - 20px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflowX: 'auto' }}>
              {!flyoverRunning ? (
                <Button size="small" onClick={runFlyover}>Flyover</Button>
              ) : (
                <Button size="small" danger onClick={stopFlyover}>Stop</Button>
              )}
              {!isFullscreen ? (
                <Button size="small" onClick={enterFullscreenMode}>Fullscreen</Button>
              ) : (
                <Button size="small" onClick={exitFullscreenMode}>Exit Fullscreen</Button>
              )}
            <Segmented
              size="small"
              value={mapType}
              onChange={setMapType}
              options={MAP_TYPE_OPTIONS}
            />
            <Space size={4}>
              <Text style={{ color: '#fff', fontSize: 12 }}>3D</Text>
              <Switch
                size="small"
                checked={enable3D}
                onChange={setEnable3D}
                disabled={mapType !== 'satellite' && mapType !== 'hybrid'}
              />
            </Space>
            {routeScrubPoints.length >= 2 && (
              <Slider
                min={0}
                max={100}
                step={1}
                value={Math.round(routeProgressPct)}
                tooltip={{ formatter: (v) => `${v}%` }}
                style={{ marginBottom: 0, minWidth: 140, width: 140 }}
                onChange={(value) => {
                  if (flyoverRunning) stopFlyover({ exitFullscreen: false });
                  setRouteProgressPct(Number(value));
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldVisitMap;
