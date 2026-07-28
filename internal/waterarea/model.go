// 文件作用：定义水域区域、边界和地图空间数据的基础模型占位。

package waterarea

// WaterArea 表示需要清洁或监管的一片水域。
type WaterArea struct {
	ID          string
	Name        string
	Status      string
	Description string
}

// BoundaryPoint 表示水域边界中的一个经纬度点。
type BoundaryPoint struct {
	SequenceNo int
	Latitude   float64
	Longitude  float64
}
