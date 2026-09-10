package api

import "testing"

func TestSharedCameraPlaybackURLs(t *testing.T) {
	for _, tc := range []struct{ name, base, want string }{
		{"default", "", "/video"},
		{"whitespace", "  ", "/video"},
		{"relative", "/video/", "/video"},
		{"external", " https://video.example.com/live/ ", "https://video.example.com/live"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			streams := NewSharedCameraStreams(tc.base)
			if len(streams) != 2 {
				t.Fatalf("got %d streams", len(streams))
			}
			for i, path := range []string{"front", "rear"} {
				want := tc.want + "/" + path + "/index.m3u8"
				if streams[i].PlayURL != want {
					t.Errorf("got %q, want %q", streams[i].PlayURL, want)
				}
			}
		})
	}
}
