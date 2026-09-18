import { describe, it, expect } from "vitest";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { ROLES_KEY } from "../common/decorators";

/**
 * Route contract of the admin API.
 *
 * The admin front end calls these paths by hand; a missing decorator turns a
 * whole moderation screen into a wall of 404s (that is how correction review
 * shipped broken). Each entry pins the path and verb the UI relies on.
 */

const expectedRoutes: Array<[keyof AdminController, string, RequestMethod]> = [
  ["approveCorrection", "corrections/:correctionId/approve", RequestMethod.POST],
  ["rejectCorrection", "corrections/:correctionId/reject", RequestMethod.POST],
  ["approveComment", "comments/:commentId/approve", RequestMethod.POST],
  ["rejectComment", "comments/:commentId/reject", RequestMethod.POST],
  ["restoreComment", "comments/:commentId/restore", RequestMethod.POST],
  ["deleteComment", "comments/:commentId/delete", RequestMethod.POST],
  ["events", "events", RequestMethod.GET],
  ["approveEvent", "events/:eventId/approve", RequestMethod.POST],
  ["rejectEvent", "events/:eventId/reject", RequestMethod.POST],
  ["approvePhoto", "photos/:photoId/approve", RequestMethod.POST],
  ["rejectPhoto", "photos/:photoId/reject", RequestMethod.POST],
  ["banUser", "users/:userId/ban", RequestMethod.POST],
  ["unbanUser", "users/:userId/unban", RequestMethod.POST],
];

describe("AdminController routes", () => {
  it("is restricted to admins at class level", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual(["ADMIN"]);
  });

  it.each(expectedRoutes)("exposes %s at %s", (handler, path, method) => {
    const fn = AdminController.prototype[handler] as unknown as object;

    expect(typeof fn).toBe("function");
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(method);
  });
});
