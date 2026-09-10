import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { getDashboardRooms } from "@/lib/data/rooms";
import { roomPhaseLabels } from "@/lib/domain/room-lifecycle";
import { roomHomePath } from "@/lib/domain/room-paths";
import { DashboardTabs } from "./dashboard-tabs";
import { RevealOnScroll } from "@/app/components/reveal-on-scroll";

export const dynamic = "force-dynamic";

type DashboardRoom = Awaited<ReturnType<typeof getDashboardRooms>>["active"][number];

function formatUpdatedAt(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function RoomCard({ room, hosting = false }: { room: DashboardRoom; hosting?: boolean }) {
  return (
    <Link
      className={`dashboard-room-card${hosting ? " is-hosting" : ""}`}
      href={roomHomePath(room.code)}
    >
      <span className="dashboard-room-card-topline">
        <span className="dashboard-room-card-pills">
          <span className={`status-pill phase-${room.phase.toLowerCase()}`}>
            {roomPhaseLabels[room.phase]}
          </span>
          {hosting && <span className="status-pill hosting-pill">Hosting</span>}
        </span>
        <span className="dashboard-room-code">{room.code}</span>
      </span>
      <span className="dashboard-room-name">{room.name}</span>
      <span className="dashboard-room-host">
        {hosting ? "You're hosting" : `Hosted by ${room.owner.displayName}`}
      </span>
      <span className="dashboard-room-meta">
        <span>{room._count.participants} of {room.maxParticipants} members</span>
        <span>Updated {formatUpdatedAt(room.updatedAt)}</span>
      </span>
      <span className="dashboard-room-open">Open club <span aria-hidden="true">→</span></span>
    </Link>
  );
}

function RoomGrid({
  rooms,
  userId,
  emptyMessage,
}: {
  rooms: DashboardRoom[];
  userId: string;
  emptyMessage: string;
}) {
  if (rooms.length === 0) {
    return <div className="dashboard-empty-row">{emptyMessage}</div>;
  }
  return (
    <div className="dashboard-room-grid">
      {rooms.map((room, index) => (
        <RevealOnScroll key={room.id} index={index}>
          <RoomCard room={room} hosting={room.ownerId === userId} />
        </RevealOnScroll>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUserOrRedirect("/dashboard");
  const [profile, rooms] = await Promise.all([
    getProfile(user.id),
    getDashboardRooms(user.id),
  ]);

  if (!profile) {
    redirect("/onboarding?next=%2Fdashboard");
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="back-link" href="/">← Back</Link>
        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <Link href="/profile">Profile</Link>
          <Link href="/dashboard">Clubs</Link>
          <form action={signOut}>
            <button className="text-button" type="submit">Sign out</button>
          </form>
        </nav>
      </header>

      <div className="dashboard-main">
        <section className="dashboard-hero">
          <div>
            <span className="eyebrow">Your movie nights</span>
            <h1>Welcome back, {profile.displayName}.</h1>
            <p>Pick up where your group left off, or start something new.</p>
          </div>
          <div className="dashboard-actions">
            <Link className="button button-primary" href="/create">Create a club</Link>
            <Link className="button button-secondary" href="/join">Join with a code</Link>
          </div>
        </section>

        <DashboardTabs
          activeCount={rooms.active.length}
          completedCount={rooms.completed.length}
          activeContent={
            <RoomGrid
              rooms={rooms.active}
              userId={rooms.userId}
              emptyMessage="No active clubs yet — create one or join with a code."
            />
          }
          completedContent={
            <RoomGrid
              rooms={rooms.completed}
              userId={rooms.userId}
              emptyMessage="Completed clubs will collect here."
            />
          }
        />
      </div>
    </main>
  );
}
