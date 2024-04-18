var map = new maplibregl.Map({
  container: 'map',
  style:
    'https://demotiles.maplibre.org/style.json', // stylesheet location
  center: [121.6, 29.8], // starting position [lng, lat]
  zoom: 3, // starting zoom
});

map.showTileBoundaries = true; // 不支持 Map 参数配置

// Create a popup, but don't add it to the map yet.
const popup = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false
});

function showInfo(e) {
  popup.remove();
  map.getCanvas().style.cursor = 'pointer';
  // 使用 queryRenderedFeatures 方法查询点击位置的要素
  // e.point 是鼠标点击位置的屏幕坐标
  var features = map.queryRenderedFeatures(e.point);

  // 检查是否获取到要素
  if (features.length) {
    const coordinates = [e.lngLat.lng, e.lngLat.lat];
    // 输出点击的要素信息
    // console.log('Clicked feature:', features[0]);
    // Populate the popup and set its coordinates
    // based on the feature found.
    const { layer, properties, source, sourceLayer } = features[0];
    const props = Object.keys(properties)
      .map((t) => `${t}: ${properties[t]}`)
      .join('<br>');
    const text = [
      'layer',
      `layerId: ${layer.id}`,
      `layerSource: ${layer.source}`,
      `layerSourceLayer: ${layer['source-layer']}`,
      // '',
      // `source: ${source}`,
      // `sourceLayer: ${sourceLayer}`,
      '',
      'props',
      props
    ].join('<br>');
    popup.setLngLat(coordinates).setHTML(text).addTo(map);
  } else {
    // 没有要素被点击
    // console.log('No features');
  }
}

map.on('load', function () {
  // 地图加载完毕后，添加事件监听器
  map.on('mousemove', (e) => {
    document.getElementById('position').innerHTML = `X: ${e.lngLat.lng.toFixed(
      6
    )} Y: ${e.lngLat.lat.toFixed(6)}`;
  });
  map.on('mousemove', showInfo);

  document.getElementById('zoom').innerHTML = map.getZoom().toFixed(6);
  map.on('zoomend', (e) => {
    document.getElementById('zoom').innerHTML = map.getZoom().toFixed(6);
  });
});

document.getElementById('tbbox').addEventListener('click', () => {
  map.showTileBoundaries = !map.showTileBoundaries;
});

document.getElementById('fbbox').addEventListener('click', () => {
  map.showCollisionBoxes = !map.showCollisionBoxes;
});

document.getElementById('info').addEventListener('click', (e) => {
  if (e.target.checked) {
    map.on('mousemove', showInfo);
  } else {
    map.off('mousemove', showInfo);
    popup.remove();
  }
});
