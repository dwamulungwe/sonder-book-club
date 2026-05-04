import { db } from "@/lib/db";
import { APP_LOGO_PATH, APP_NAME } from "@/lib/brand";

export const CLUB_SETTINGS_ID = "main-club";

const defaultSettings = {
  id: CLUB_SETTINGS_ID,
  name: APP_NAME,
  description:
    "A quiet, editorial reading space for books, plans, meetings, and the next great vote.",
  meetingFrequency: "To be confirmed",
  location: "To be confirmed",
  contactEmail: null,
  contactPhone: null,
  logoUrl: APP_LOGO_PATH,
  bannerUrl: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

export async function getClubSettings() {
  return (
    (await db.clubSettings.findUnique({
      where: {
        id: CLUB_SETTINGS_ID,
      },
    })) ?? defaultSettings
  );
}
