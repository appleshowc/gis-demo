# 热力图：客户端大数据量渲染

## 基于 geoscene js v4.23 版本实现

1. 加入了迭代器，分批渲染数据，初次加载时会出现不断刷新热力图的现象
2. 加入了比例尺切换，在小比例尺下将热力图渲染换成实际点位渲染

### 参考案例

- [Working with large feature collections | Sample Code | ArcGIS Maps SDK for JavaScript 4.29 | ArcGIS Developers](https://developers.arcgis.com/javascript/latest/sample-code/layers-featurelayer-large-collection/)
- [Create a scale-dependent visualization | Sample Code | ArcGIS Maps SDK for JavaScript 4.29 | ArcGIS Developers](https://developers.arcgis.com/javascript/latest/sample-code/visualization-heatmap-scale/)

### 效果

![效果图](./images/demo.gif)

## 基于 echarts v5 扩展 arcgis 地图组件实现

1. 参照 echarts 百度地图扩展，编写 ArcGIS 地图扩展
2. 测试发现 ArcGIS JS 的地理坐标转屏幕坐标的速度比百度地图**慢**将近 10 倍，如果传入的坐标点参考系与地图不一致，在地图缩放或平移时热力图渲染延迟会很明显，因此建议传入数据前预先处理，保持坐标系一致

### 参考案例

[echarts 百度地图扩展](https://github.com/apache/echarts/tree/master/extension-src/bmap)

### 效果

![效果图](./images/demo2.gif)
