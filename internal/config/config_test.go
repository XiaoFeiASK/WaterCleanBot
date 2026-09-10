package config

import "testing"

func TestCameraHLSBaseURL(t *testing.T) {
	for _, tc := range []struct{ name, value, want string }{
		{"default", "", "/video"},
		{"explicit", "https://video.example.com/live", "https://video.example.com/live"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// No .env exists in this package directory; explicit process settings win.
			t.Setenv("CAMERA_HLS_BASE_URL", tc.value)
			if got := Load().CameraHLSBaseURL; got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}
