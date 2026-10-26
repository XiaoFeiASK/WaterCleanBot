package shoreline

import (
	"encoding/json"
	"strings"
	"testing"
)

func raw(value string) json.RawMessage { return json.RawMessage(value) }

func testShoreline() json.RawMessage {
	return raw(`{"schema_version":3,"session_id":"bundle-a","state":"completed","datum":"WGS84","valid":true,"contour_count":1,"point_count":2,"contours":[{"contour_id":1,"side":1,"sections":[{"line_id":1,"contour_id":1,"section_order":1,"side":1,"kind":1,"points":[{"longitude_deg":121.4,"latitude_deg":31.2},{"longitude_deg":121.5,"latitude_deg":31.3}]}]}]}`)
}

func testReference(key string) json.RawMessage {
	side, bank, mode := `null`, ``, "center_reference"
	if key == "left" {
		side, bank, mode = "1", "left", "near_bank_reference"
	} else if key == "right" {
		side, bank, mode = "0", "right", "near_bank_reference"
	}
	return raw(`{"schema_version":3,"session_id":"bundle-a","state":"completed","datum":"WGS84","valid":true,"point_count":2,"route_name":"` + key + `","planning_mode":"` + mode + `","side":` + side + `,"bank_name":"` + bank + `","points":[{"point_id":1,"longitude_deg":121.4,"latitude_deg":31.2,"reference_segment_id":1,"reference_can_connect_previous":false,"side":` + side + `,"map_section":1},{"point_id":2,"longitude_deg":121.5,"latitude_deg":31.3,"reference_segment_id":1,"reference_can_connect_previous":true,"side":` + side + `,"map_section":1}]}`)
}

func fullTestFiles() Files {
	return Files{Shoreline: testShoreline(), Left: testReference("left"), Center: testReference("center"), Right: testReference("right")}
}

func TestValidateFilesAcceptsAndPreservesCompleteBundle(t *testing.T) {
	files := fullTestFiles()
	validated, err := ValidateFiles(files)
	if err != nil {
		t.Fatalf("ValidateFiles rejected complete bundle: %v", err)
	}
	for name, got := range map[string]json.RawMessage{
		"shoreline": validated.Shoreline, "left": validated.Left, "center": validated.Center, "right": validated.Right,
	} {
		if len(got) == 0 {
			t.Errorf("%s file was lost", name)
		}
		var original, preserved any
		if err := json.Unmarshal(files.raw(name), &original); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(got, &preserved); err != nil {
			t.Fatal(err)
		}
		if !equalJSON(original, preserved) {
			t.Errorf("%s data changed during validation", name)
		}
	}
}

func (f Files) raw(name string) json.RawMessage {
	switch name {
	case "shoreline":
		return f.Shoreline
	case "left":
		return f.Left
	case "center":
		return f.Center
	default:
		return f.Right
	}
}

func equalJSON(a, b any) bool {
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)
	return string(left) == string(right)
}

func TestValidateFilesAllowsPartialAndClearsAbsentOrEmptyOptionalFiles(t *testing.T) {
	partial := testShoreline()
	value := strings.Replace(string(partial), `"completed"`, `"partial"`, 1)
	files := Files{Shoreline: raw(value), Left: raw(`{"points":[]}`)}
	validated, err := ValidateFiles(files)
	if err != nil {
		t.Fatalf("ValidateFiles rejected partial shoreline with empty optional file: %v", err)
	}
	if len(validated.Left) != 0 || len(validated.Center) != 0 || len(validated.Right) != 0 {
		t.Fatalf("empty optional data was not normalized to absent: %+v", validated)
	}
}

func TestValidateFilesAllowsEachFileIndependently(t *testing.T) {
	for _, test := range []struct {
		name  string
		files Files
		key   string
	}{
		{name: "shoreline", files: Files{Shoreline: testShoreline()}, key: "shoreline"},
		{name: "left", files: Files{Left: testReference("left")}, key: "left"},
		{name: "center", files: Files{Center: testReference("center")}, key: "center"},
		{name: "right", files: Files{Right: testReference("right")}, key: "right"},
	} {
		t.Run(test.name, func(t *testing.T) {
			validated, err := ValidateFiles(test.files)
			if err != nil {
				t.Fatalf("ValidateFiles rejected independent %s upload: %v", test.name, err)
			}
			if len(validated.raw(test.key)) == 0 {
				t.Fatalf("validated %s file was lost", test.name)
			}
		})
	}
}

func TestMergeFilesReplacesOnlyUploadedFile(t *testing.T) {
	current := fullTestFiles()
	updatedCenter := raw(strings.Replace(string(testReference("center")), `"longitude_deg":121.4`, `"longitude_deg":121.41`, 1))
	merged, err := MergeFiles(current, Files{Center: updatedCenter})
	if err != nil {
		t.Fatalf("MergeFiles rejected independent upload: %v", err)
	}
	if !equalJSON(merged.Shoreline, current.Shoreline) || !equalJSON(merged.Left, current.Left) || !equalJSON(merged.Right, current.Right) {
		t.Fatal("MergeFiles changed files that were not uploaded")
	}
	if equalJSON(merged.Center, current.Center) || !equalJSON(merged.Center, updatedCenter) {
		t.Fatal("MergeFiles did not replace the uploaded file")
	}
}

func TestValidateFilesRejectsInvalidBundles(t *testing.T) {
	tests := []struct {
		name string
		edit func(*Files)
	}{
		{name: "empty upload", edit: func(f *Files) { *f = Files{} }},
		{name: "schema version", edit: func(f *Files) {
			f.Shoreline = raw(strings.Replace(string(f.Shoreline), `"schema_version":3`, `"schema_version":2`, 1))
		}},
		{name: "mixed session", edit: func(f *Files) { f.Left = raw(strings.Replace(string(f.Left), "bundle-a", "bundle-b", 1)) }},
		{name: "wrong reference side", edit: func(f *Files) { f.Right = raw(strings.Replace(string(f.Right), `"side":0`, `"side":1`, 1)) }},
		{name: "illegal coordinate", edit: func(f *Files) {
			f.Shoreline = raw(strings.Replace(string(f.Shoreline), `"longitude_deg":121.4`, `"longitude_deg":181`, 1))
		}},
		{name: "failed state", edit: func(f *Files) { f.Shoreline = raw(strings.Replace(string(f.Shoreline), `"completed"`, `"failed"`, 1)) }},
		{name: "invalid flag", edit: func(f *Files) {
			f.Shoreline = raw(strings.Replace(string(f.Shoreline), `"valid":true`, `"valid":false`, 1))
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			files := fullTestFiles()
			test.edit(&files)
			if _, err := ValidateFiles(files); err == nil {
				t.Fatal("ValidateFiles accepted invalid bundle")
			}
		})
	}
}
