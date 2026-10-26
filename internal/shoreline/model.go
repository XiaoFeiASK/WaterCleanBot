package shoreline

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
)

const MaxRequestBytes = 20 << 20

var ErrConflict = errors.New("shoreline revision conflict")

type Files struct {
	Shoreline json.RawMessage `json:"shoreline,omitempty"`
	Left      json.RawMessage `json:"left,omitempty"`
	Center    json.RawMessage `json:"center,omitempty"`
	Right     json.RawMessage `json:"right,omitempty"`
}

type Uploader struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
}

type Dataset struct {
	Revision   string    `json:"revision"`
	Files      Files     `json:"files"`
	UpdatedAt  time.Time `json:"updatedAt"`
	UploadedBy Uploader  `json:"uploadedBy"`
}

type ValidationError struct{ Message string }

func (e *ValidationError) Error() string { return e.Message }

type coordinate struct {
	Longitude *float64 `json:"longitude_deg"`
	Latitude  *float64 `json:"latitude_deg"`
}

func (p coordinate) valid() bool {
	return p.Longitude != nil && p.Latitude != nil &&
		!math.IsNaN(*p.Longitude) && !math.IsInf(*p.Longitude, 0) && math.Abs(*p.Longitude) <= 180 &&
		!math.IsNaN(*p.Latitude) && !math.IsInf(*p.Latitude, 0) && math.Abs(*p.Latitude) <= 90
}

type point struct {
	coordinate
	ID               *int  `json:"point_id"`
	ReferenceSegment *int  `json:"reference_segment_id"`
	ReferenceConnect *bool `json:"reference_can_connect_previous"`
	MapSection       *int  `json:"map_section"`
	Side             *int  `json:"side"`
}

type section struct {
	ID        int          `json:"line_id"`
	ContourID int          `json:"contour_id"`
	Order     int          `json:"section_order"`
	Side      *int         `json:"side"`
	Kind      int          `json:"kind"`
	Points    []coordinate `json:"points"`
}

type contour struct {
	ID       int       `json:"contour_id"`
	Side     *int      `json:"side"`
	Sections []section `json:"sections"`
}

type document struct {
	SchemaVersion int       `json:"schema_version"`
	SessionID     string    `json:"session_id"`
	Datum         string    `json:"datum"`
	State         string    `json:"state"`
	Valid         *bool     `json:"valid"`
	PointCount    *int      `json:"point_count"`
	ContourCount  *int      `json:"contour_count"`
	Contours      []contour `json:"contours"`
	Points        []point   `json:"points"`
	Side          *int      `json:"side"`
	BankName      string    `json:"bank_name"`
	RouteName     string    `json:"route_name"`
	PlanningMode  string    `json:"planning_mode"`
}

func absent(raw json.RawMessage) bool {
	return len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null"))
}

// ValidateFiles validates the display contract without rewriting safety metadata or coordinates.
func ValidateFiles(files Files) (Files, error) {
	result := files
	var sessionID string
	for _, entry := range []struct {
		name string
		raw  *json.RawMessage
	}{{"shoreline", &result.Shoreline}, {"left", &result.Left}, {"center", &result.Center}, {"right", &result.Right}} {
		invalid := func(message string) (Files, error) {
			return Files{}, &ValidationError{Message: fmt.Sprintf("%s: %s", entry.name, message)}
		}
		if absent(*entry.raw) {
			*entry.raw = nil
			continue
		}
		var doc document
		if err := json.Unmarshal(*entry.raw, &doc); err != nil {
			return invalid("JSON 结构或字段类型错误")
		}
		if entry.name != "shoreline" && doc.Points != nil && len(doc.Points) == 0 && doc.Contours == nil {
			*entry.raw = nil
			continue
		}
		if doc.SchemaVersion != 3 || doc.Datum != "WGS84" || strings.TrimSpace(doc.SessionID) == "" {
			return invalid("必须是 schema_version=3、WGS84 且包含 session_id")
		}
		if doc.Valid == nil || !*doc.Valid || (doc.State != "completed" && doc.State != "partial") {
			return invalid("仅接受有效的 completed 或 partial 数据")
		}
		if sessionID == "" {
			sessionID = doc.SessionID
		} else if sessionID != doc.SessionID {
			return invalid("session_id 不一致，不能混用不同组数据")
		}
		count := 0
		if entry.name == "shoreline" {
			if len(doc.Contours) == 0 || doc.Points != nil || doc.ContourCount == nil || *doc.ContourCount != len(doc.Contours) {
				return invalid("岸线 contours 或 contour_count 错误")
			}
			contourIDs := map[int]bool{}
			lineIDs := map[int]bool{}
			for _, c := range doc.Contours {
				if c.ID <= 0 || contourIDs[c.ID] || !validSide(c.Side) || len(c.Sections) == 0 {
					return invalid("轮廓编号、侧别或分段错误")
				}
				contourIDs[c.ID] = true
				orders := map[int]bool{}
				for _, s := range c.Sections {
					if s.ID <= 0 || lineIDs[s.ID] || s.ContourID != c.ID || s.Order <= 0 || orders[s.Order] ||
						!validSide(s.Side) || *s.Side != *c.Side || (s.Kind != 1 && s.Kind != 3) || len(s.Points) == 0 {
						return invalid("岸桥分段编号、顺序、侧别或类型错误")
					}
					lineIDs[s.ID], orders[s.Order] = true, true
					for _, p := range s.Points {
						if !p.valid() {
							return invalid("岸桥点经纬度缺失或超出范围")
						}
					}
					count += len(s.Points)
				}
			}
		} else {
			if len(doc.Points) == 0 || doc.Contours != nil || doc.RouteName != entry.name {
				return invalid("参考线类型或 points 错误")
			}
			if entry.name == "center" {
				if doc.PlanningMode != "center_reference" || doc.Side != nil || doc.BankName != "" {
					return invalid("中心参考线类型错误")
				}
			} else {
				side := 0
				if entry.name == "left" {
					side = 1
				}
				if doc.PlanningMode != "near_bank_reference" || doc.Side == nil || *doc.Side != side || doc.BankName != entry.name {
					return invalid("近岸参考线侧别错误")
				}
			}
			lastID := 0
			for _, p := range doc.Points {
				if !p.coordinate.valid() || p.ID == nil || *p.ID <= lastID || p.ReferenceSegment == nil || *p.ReferenceSegment <= 0 || p.ReferenceConnect == nil {
					return invalid("参考点经纬度、编号或参考连接字段错误")
				}
				if entry.name != "center" && (p.MapSection == nil || *p.MapSection <= 0 || p.Side == nil || *p.Side != *doc.Side) {
					return invalid("近岸参考点章节或侧别错误")
				}
				lastID = *p.ID
			}
			count = len(doc.Points)
		}
		if doc.PointCount == nil || *doc.PointCount != count {
			return invalid("point_count 与实际点数不一致")
		}
	}
	if absent(result.Shoreline) && absent(result.Left) && absent(result.Center) && absent(result.Right) {
		return Files{}, &ValidationError{Message: "请至少上传一个有效的岸线或航线文件"}
	}
	return result, nil
}

// MergeFiles replaces only uploaded files; omitted and empty files retain current data.
func MergeFiles(current, uploaded Files) (Files, error) {
	validated, err := ValidateFiles(uploaded)
	if err != nil {
		return Files{}, err
	}
	for _, pair := range []struct{ target, source *json.RawMessage }{
		{&current.Shoreline, &validated.Shoreline}, {&current.Left, &validated.Left},
		{&current.Center, &validated.Center}, {&current.Right, &validated.Right},
	} {
		if !absent(*pair.source) {
			*pair.target = *pair.source
		}
	}
	return ValidateFiles(current)
}

func validSide(side *int) bool { return side != nil && (*side == 0 || *side == 1) }
