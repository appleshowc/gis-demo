function v2Equal(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

export default echarts.extendComponentModel({
  type: 'arcmap',

  getArcMap: function () {
    // __arcmap is injected when creating ArcMapCoordSys
    return this.__arcmap;
  },

  getEchartsContainer: function () {
    // __echartsContainer is injected when creating ArcMapCoordSys
    return this.__echartsContainer;
  },

  setCenterAndZoom: function (center, zoom) {
    this.option.center = center;
    this.option.zoom = zoom;
  },

  centerOrZoomChanged: function (center, zoom) {
    const option = this.option;
    return !(v2Equal(center, option.center) && zoom === option.zoom);
  },

  defaultOption: {
    center: [104.114129, 37.550339],
    zoom: 5,
    roam: false,
    dataWkid: 3857
  }
});
