export default echarts.extendComponentView({
  type: 'arcmap',

  render: function (arcmapModel, ecModel, api) {
    let rendering = true;

    const arcmap = arcmapModel.getArcMap();
    const viewportRoot = api.getZr().painter.getViewportRoot();
    // const coordSys = arcmapModel.coordinateSystem;
    // const { zoom } = arcmap;

    const moveHandler = function (stationary) {
      viewportRoot.style.visibility = 'hidden';
      if (rendering || !stationary) {
        return;
      }
      viewportRoot.style.visibility = 'visible';

      api.dispatchAction({
        type: 'arcmapRoam',
        animation: {
          duration: 0
        }
      });
    };

    this._oldMoveHandler?.remove();
    this._oldMoveHandler = arcmap.watch('stationary', moveHandler);

    rendering = false;
  },

  dispose: function () {
    this._oldMoveHandler?.remove();
  }
});
