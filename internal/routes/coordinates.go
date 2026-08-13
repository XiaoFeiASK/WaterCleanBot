// 文件作用：提供航线下发所需的 WGS-84 与 GCJ-02 坐标转换。

package routes

import "math"

const (
	semiMajorAxis       = 6378245.0
	eccentricitySquared = 0.00669342162296594323
)

func transformLatitude(x float64, y float64) float64 {
	value := -100.0 + 2.0*x + 3.0*y + 0.2*y*y + 0.1*x*y + 0.2*math.Sqrt(math.Abs(x))
	value += (20.0*math.Sin(6.0*x*math.Pi) + 20.0*math.Sin(2.0*x*math.Pi)) * 2.0 / 3.0
	value += (20.0*math.Sin(y*math.Pi) + 40.0*math.Sin(y/3.0*math.Pi)) * 2.0 / 3.0
	value += (160.0*math.Sin(y/12.0*math.Pi) + 320*math.Sin(y*math.Pi/30.0)) * 2.0 / 3.0
	return value
}

func transformLongitude(x float64, y float64) float64 {
	value := 300.0 + x + 2.0*y + 0.1*x*x + 0.1*x*y + 0.1*math.Sqrt(math.Abs(x))
	value += (20.0*math.Sin(6.0*x*math.Pi) + 20.0*math.Sin(2.0*x*math.Pi)) * 2.0 / 3.0
	value += (20.0*math.Sin(x*math.Pi) + 40.0*math.Sin(x/3.0*math.Pi)) * 2.0 / 3.0
	value += (150.0*math.Sin(x/12.0*math.Pi) + 300.0*math.Sin(x/30.0*math.Pi)) * 2.0 / 3.0
	return value
}

func outsideChina(lat float64, lng float64) bool {
	return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

// WGS84ToGCJ02 把 GPS 坐标转换为高德地图使用的 GCJ-02。
func WGS84ToGCJ02(lat float64, lng float64) (float64, float64) {
	if !isFinite(lat) || !isFinite(lng) || outsideChina(lat, lng) {
		return lat, lng
	}

	latitudeOffset := transformLatitude(lng-105.0, lat-35.0)
	longitudeOffset := transformLongitude(lng-105.0, lat-35.0)
	latitudeRadians := lat / 180.0 * math.Pi
	magic := math.Sin(latitudeRadians)
	magic = 1 - eccentricitySquared*magic*magic
	squareRootMagic := math.Sqrt(magic)
	deltaLatitude := latitudeOffset * 180.0 / ((semiMajorAxis * (1 - eccentricitySquared)) / (magic * squareRootMagic) * math.Pi)
	deltaLongitude := longitudeOffset * 180.0 / (semiMajorAxis / squareRootMagic * math.Cos(latitudeRadians) * math.Pi)

	return lat + deltaLatitude, lng + deltaLongitude
}

// GCJ02ToWGS84 迭代反算 GCJ-02 点对应的 GPS 坐标，供艇端导航下发使用。
func GCJ02ToWGS84(lat float64, lng float64) (float64, float64) {
	if !isFinite(lat) || !isFinite(lng) || outsideChina(lat, lng) {
		return lat, lng
	}

	wgsLat, wgsLng := lat, lng
	for i := 0; i < 6; i++ {
		gcjLat, gcjLng := WGS84ToGCJ02(wgsLat, wgsLng)
		latDiff := gcjLat - lat
		lngDiff := gcjLng - lng
		wgsLat -= latDiff
		wgsLng -= lngDiff
		if math.Abs(latDiff) < 1e-10 && math.Abs(lngDiff) < 1e-10 {
			break
		}
	}
	return wgsLat, wgsLng
}
