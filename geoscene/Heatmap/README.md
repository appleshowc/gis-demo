# 热力图：客户端大数据量渲染

基于 geoscene js v4.23 版本实现。

1. 加入了迭代器，分批渲染数据，初次加载时会出现不断刷新热力图的现象
2. 加入了比例尺切换，在小比例尺下将热力图渲染换成实际点位渲染

## 参考案例

- [Working with large feature collections | Sample Code | ArcGIS Maps SDK for JavaScript 4.29 | ArcGIS Developers](https://developers.arcgis.com/javascript/latest/sample-code/layers-featurelayer-large-collection/)
- [Create a scale-dependent visualization | Sample Code | ArcGIS Maps SDK for JavaScript 4.29 | ArcGIS Developers](https://developers.arcgis.com/javascript/latest/sample-code/visualization-heatmap-scale/)

## 效果

![效果图](./images/demo.gif)
