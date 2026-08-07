// =====================================================================
// The Hidden Geography of a Web Page — thereformation.com
//
// Loads ip_locations.geojson (produced by scrape_har_locations.py from a
// HAR capture of the Reformation homepage) and plots every server the
// browser contacted. The script keeps one point per unique server IP, and
// many IPs sit in the same city, so we aggregate points that share
// coordinates into one dot, sized by how many servers landed there.
//
// Shares the MapLibre + GeoJSON approach and the palette of the
// "Morning Coffee in the Shade" bench-shade map.
// =====================================================================

var map = new maplibregl.Map({
  container: 'map',
  style: 'MapBaseV2.json',       // reused Protomaps light base (tutorial base)
  center: [-40, 32],             // Atlantic-centred so US + EU both show
  zoom: 1.6
});

map.addControl(new maplibregl.NavigationControl());

// ---- palette (Reformation: monochrome + one aqua accent) -------------
var INK = '#111111';      // strokes
var PAPER = '#ffffff';    // regular server fill (open dot)
var AQUA = '#7FD4D6';     // busiest location — light aqua (ocean) accent

// Round coordinates so IPs in the same city collapse onto one dot.
// (ipinfo.io returns city-level points, so this is safe.)
function coordKey(coords) {
  return coords[0].toFixed(3) + ',' + coords[1].toFixed(3);
}

function hostOf(url) {
  try { return new URL(url).hostname; }
  catch (e) { return url; }
}

// Fold the raw request points into one feature per location.
function aggregate(geojson) {
  var byPlace = {};

  geojson.features.forEach(function (f) {
    if (!f.geometry || !f.geometry.coordinates) return;
    var c = f.geometry.coordinates;
    if (!c[0] && !c[1]) return;            // drop failed lookups at 0,0
    var key = coordKey(c);

    if (!byPlace[key]) {
      byPlace[key] = { coords: c, count: 0, hosts: {} };
    }
    var place = byPlace[key];
    place.count += 1;
    place.hosts[hostOf(f.properties.url)] = true;
  });

  var keys = Object.keys(byPlace);
  var maxCount = keys.reduce(function (m, k) {
    return Math.max(m, byPlace[k].count);
  }, 0);

  var features = keys.map(function (k) {
    var p = byPlace[k];
    return {
      type: 'Feature',
      properties: {
        count: p.count,
        hosts: Object.keys(p.hosts).sort().join('\n'),
        isBusiest: p.count === maxCount
      },
      geometry: { type: 'Point', coordinates: p.coords }
    };
  });

  return {
    fc: { type: 'FeatureCollection', features: features },
    totalRequests: geojson.features.filter(function (f) {
      var c = f.geometry && f.geometry.coordinates;
      return c && (c[0] || c[1]);
    }).length,
    places: features.length
  };
}


map.on('load', function () {
  fetch('ip_locations.geojson')
    .then(function (r) { return r.json(); })
    .then(function (raw) {
      var data = aggregate(raw);

      // ---- panel readout ----
      document.getElementById('stat-requests').textContent = data.totalRequests;
      document.getElementById('stat-places').textContent = data.places;

      // ---- source + layer ----
      map.addSource('servers', { type: 'geojson', data: data.fc });

      map.addLayer({
        id: 'servers-layer',
        type: 'circle',
        source: 'servers',
        paint: {
          // area grows with request count
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'count'],
            1, 6,
            5, 12,
            10, 18,
            20, 26
          ],
          'circle-color': [
            'case',
            ['get', 'isBusiest'], AQUA,   // busiest location — light aqua
            PAPER                          // every other location — open white
          ],
          'circle-opacity': 0.92,
          'circle-stroke-width': [
            'case', ['get', 'isBusiest'], 1.5, 1.2
          ],
          'circle-stroke-color': INK      // black outline on every dot
        }
      });

      // ---- interactions ----
      map.on('click', 'servers-layer', function (e) {
        var f = e.features[0];
        var props = f.properties;
        var coordinates = f.geometry.coordinates.slice();

        var hosts = String(props.hosts).split('\n');
        var items = hosts.map(function (h) { return '<li>' + h + '</li>'; }).join('');

        var html =
          '<strong>' + props.count + ' server' + (props.count === 1 ? '' : 's') +
          ' from here</strong>' +
          '<span class="popup-count">' + hosts.length + ' host' +
          (hosts.length === 1 ? '' : 's') + '</span>' +
          '<ul class="popup-hosts">' + items + '</ul>';

        new maplibregl.Popup({ maxWidth: '280px' })
          .setLngLat(coordinates)
          .setHTML(html)
          .addTo(map);
      });

      map.on('mouseenter', 'servers-layer', function () {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'servers-layer', function () {
        map.getCanvas().style.cursor = '';
      });
    })
    .catch(function (err) {
      document.getElementById('hint').textContent =
        'Could not load ip_locations.geojson';
      console.error(err);
    });
});
