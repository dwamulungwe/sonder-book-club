import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { SectionHeading } from "@/components/app/section-heading";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getMeetingsPageData } from "@/features/club/queries";
import {
  createMeetingAction,
  updateMeetingAttendanceAction,
  updateMeetingNotesAction,
  updateMeetingRsvpAction,
} from "@/features/meetings/actions";
import {
  formatDateTime,
  formatRsvpStatus,
} from "@/lib/formatters";
import {
  canModerateClub,
  canParticipateInClub,
} from "@/lib/permissions";
import { requireSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Meetings",
};

export default async function MeetingsPage() {
  const user = await requireSessionUser();
  const data = await getMeetingsPageData(user.id);
  const canModerate = canModerateClub(user, data.viewerMembership);
  const canParticipate = canParticipateInClub(user, data.viewerMembership);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Meetings"
          title="Schedule the next conversation"
          description="Schedule the next discussion, track who is coming, and keep attendance and notes close to the agenda."
        />
      </section>

      {canModerate ? (
        <Card className="border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-950">Create meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createMeetingAction} className="grid gap-4 md:grid-cols-2">
              <input type="hidden" name="redirectTo" value="/meetings" />
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="meeting-title">Title</Label>
                <Input id="meeting-title" name="title" required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="meeting-agenda">Agenda</Label>
                <Textarea id="meeting-agenda" name="agenda" rows={4} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-date">Date</Label>
                <Input id="meeting-date" name="date" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-time">Time</Label>
                <Input id="meeting-time" name="time" type="time" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-location">Location</Label>
                <Input id="meeting-location" name="location" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-link">Meeting link</Label>
                <Input id="meeting-link" name="meetingLink" type="url" />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800 sm:w-auto"
                >
                  Schedule meeting
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-zinc-950">Meetings overview</CardTitle>
        </CardHeader>
        <CardContent>
          {data.meetings.length > 0 ? (
            <>
              <div className="space-y-3 md:hidden">
                {data.meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="rounded-xl border border-zinc-200 p-4"
                  >
                    <p className="font-medium text-zinc-900">{meeting.title}</p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {formatDateTime(meeting.startsAt)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {meeting.location ?? meeting.meetingLink ?? "Location pending"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                      <span>{meeting.rsvps.length} RSVPs</span>
                      <span>{meeting.attendances.length} attendance updates</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Meeting</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>RSVPs</TableHead>
                      <TableHead>Attendance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.meetings.map((meeting) => (
                      <TableRow key={meeting.id}>
                        <TableCell className="whitespace-normal">
                          <div>
                            <p className="font-medium text-zinc-900">{meeting.title}</p>
                            <p className="text-xs text-zinc-500">
                              {meeting.location ?? meeting.meetingLink ?? "Location pending"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{formatDateTime(meeting.startsAt)}</TableCell>
                        <TableCell>{meeting.rsvps.length}</TableCell>
                        <TableCell>{meeting.attendances.length}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <EmptyState
              title="No meetings scheduled"
              description="Add the next discussion session and the club can start RSVPing."
            />
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        {data.meetings.map((meeting) => {
          const viewerRsvp =
            meeting.rsvps.find((rsvp) => rsvp.memberId === user.id) ?? null;

          return (
            <Card key={meeting.id} className="border-zinc-200 bg-white shadow-sm">
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-semibold text-zinc-950">
                        {meeting.title}
                      </h3>
                      {viewerRsvp ? (
                        <StatusBadge tone="sky">
                          {formatRsvpStatus(viewerRsvp.status)}
                        </StatusBadge>
                      ) : null}
                    </div>
                    <p className="text-sm text-zinc-600">
                      {formatDateTime(meeting.startsAt)}
                    </p>
                    <p className="text-sm text-zinc-600">
                      {meeting.location ?? meeting.meetingLink ?? "Location pending"}
                    </p>
                    <p className="text-sm leading-6 text-zinc-600">
                      {meeting.agenda ?? "No agenda has been added yet."}
                    </p>
                  </div>
                </div>

                {canParticipate ? (
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    {["GOING", "MAYBE", "DECLINED"].map((status) => (
                      <form key={status} action={updateMeetingRsvpAction}>
                        <input type="hidden" name="meetingId" value={meeting.id} />
                        <input type="hidden" name="status" value={status} />
                        <input type="hidden" name="redirectTo" value="/meetings" />
                        <button
                          type="submit"
                          className="min-h-11 w-full rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-200 sm:w-auto sm:text-xs"
                        >
                          {status.toLowerCase()}
                        </button>
                      </form>
                    ))}
                  </div>
                ) : null}

                {canModerate ? (
                  <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                    <form action={updateMeetingNotesAction} className="space-y-2">
                      <input type="hidden" name="meetingId" value={meeting.id} />
                      <input type="hidden" name="redirectTo" value="/meetings" />
                      <Label htmlFor={`meeting-notes-${meeting.id}`}>Meeting notes</Label>
                      <Textarea
                        id={`meeting-notes-${meeting.id}`}
                        name="notes"
                        rows={6}
                        defaultValue={meeting.notes ?? ""}
                      />
                      <button
                        type="submit"
                        className="min-h-11 w-full rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:w-auto"
                      >
                        Save notes
                      </button>
                    </form>

                    <div className="space-y-3">
                      <p className="text-sm font-medium text-zinc-900">Attendance</p>
                      {data.members.map((membership) => {
                        const attendance =
                          meeting.attendances.find(
                            (item) => item.memberId === membership.userId,
                          ) ?? null;

                        return (
                          <form
                            key={`${meeting.id}-${membership.id}`}
                            action={updateMeetingAttendanceAction}
                            className="grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_auto]"
                          >
                            <input type="hidden" name="meetingId" value={meeting.id} />
                            <input type="hidden" name="memberId" value={membership.userId} />
                            <input type="hidden" name="redirectTo" value="/meetings" />
                            <div>
                              <p className="text-sm font-medium text-zinc-900">
                                {membership.user.name}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {attendance ? attendance.status.toLowerCase() : "pending"}
                              </p>
                            </div>
                            <select
                              name="status"
                              defaultValue={attendance?.status ?? "PENDING"}
                              className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                            >
                              <option value="PENDING">pending</option>
                              <option value="ATTENDED">attended</option>
                              <option value="ABSENT">absent</option>
                              <option value="EXCUSED">excused</option>
                            </select>
                            <button
                              type="submit"
                              className="min-h-11 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:col-span-2 sm:text-xs lg:col-span-1"
                            >
                              Save
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
