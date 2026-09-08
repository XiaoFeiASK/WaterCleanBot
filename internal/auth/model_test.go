package auth

import "testing"

func TestRoleLevels(t *testing.T) {
	tests := []struct {
		role  string
		level int
	}{
		{RoleUser, 1},
		{RoleSuperuser, 2},
		{RoleAdmin, 3},
		{"unknown", 0},
	}
	for _, test := range tests {
		if got := RoleLevel(test.role); got != test.level {
			t.Errorf("RoleLevel(%q) = %d, want %d", test.role, got, test.level)
		}
	}
}

func TestHasMinimumRole(t *testing.T) {
	if !HasMinimumRole(RoleAdmin, RoleSuperuser) {
		t.Fatal("administrator should include superuser permissions")
	}
	if !HasMinimumRole(RoleSuperuser, RoleUser) {
		t.Fatal("superuser should include ordinary user permissions")
	}
	if HasMinimumRole(RoleSuperuser, RoleAdmin) {
		t.Fatal("superuser should not include administrator permissions")
	}
	if HasMinimumRole("unknown", RoleUser) || HasMinimumRole(RoleAdmin, "unknown") {
		t.Fatal("unknown roles must not grant permissions")
	}
}
