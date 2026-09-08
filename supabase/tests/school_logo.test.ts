import { adminQueries } from "@sabidrive/supabase";
import type { SabiDriveSupabaseClient } from "@sabidrive/supabase/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSchool, createUser, deleteSchool, deleteUser, setProfileSchool, signInClient, uniqueSuffix } from "./helpers";

// A tiny valid 1x1 PNG, just enough bytes to exercise a real upload.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

describe("school_logo", () => {
  const suffix = uniqueSuffix();
  const password = "TestPass123!";
  let schoolId: string;
  let otherSchoolId: string;
  const userIds: string[] = [];
  let adminClient: SabiDriveSupabaseClient;

  beforeAll(async () => {
    schoolId = await createSchool(`Logo Test School ${suffix}`);
    otherSchoolId = await createSchool(`Logo Test Other School ${suffix}`);

    const adminId = await createUser(`logo-admin-${suffix}@example.com`, password, { full_name: "Logo Admin", role: "admin" });
    userIds.push(adminId);
    await setProfileSchool(adminId, schoolId);

    adminClient = await signInClient(`logo-admin-${suffix}@example.com`, password);
  });

  afterAll(async () => {
    // Storage objects for a deleted school are orphaned (bucket has no FK to
    // schools), so clean up explicitly rather than relying on cascade.
    await adminClient.storage.from("school-logos").remove([`${schoolId}/logo`]);
    await deleteSchool(schoolId);
    await deleteSchool(otherSchoolId);
    for (const id of userIds) await deleteUser(id);
  });

  it("lets an admin upload a logo under their own school's path and read it back via the public URL", async () => {
    const path = `${schoolId}/logo`;
    const { error: uploadError } = await adminClient.storage
      .from("school-logos")
      .upload(path, PNG_BYTES, { upsert: true, contentType: "image/png" });
    expect(uploadError).toBeNull();

    const { data } = adminClient.storage.from("school-logos").getPublicUrl(path);
    const res = await fetch(data.publicUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("does not let an admin upload under a different school's path (RLS)", async () => {
    const path = `${otherSchoolId}/logo`;
    const { error: uploadError } = await adminClient.storage
      .from("school-logos")
      .upload(path, PNG_BYTES, { upsert: true, contentType: "image/png" });
    expect(uploadError).not.toBeNull();
  });

  it("persists the public URL onto schools.logo_url via updateSchool", async () => {
    await adminQueries.updateSchool(adminClient, schoolId, { logo_url: "https://example.com/fake-logo.png" });
    const school = await adminQueries.getSchool(adminClient, schoolId);
    expect(school.logo_url).toBe("https://example.com/fake-logo.png");
  });
});
