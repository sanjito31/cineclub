import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { getDashboardRooms } from "@/lib/data/rooms";
import { roomPhaseLabels } from "@/lib/domain/room-lifecycle";

export const dynamic = "force-dynamic";

type DashboardRoom = Awaited<ReturnType<typeof getDashboardRooms>>["hosting"][number];

function formatUpdatedAt(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function RoomCard({ room, hosting = false }: { room: DashboardRoom; hosting?: boolean }) {
  return (
    <Link className="dashboard-room-card" href={`/rooms/${room.code}`}>
      <span className="dashboard-room-card-topline">
        <span className={`status-pill phase-${room.phase.toLowerCase()}`}>
          {roomPhaseLabels[room.phase]}
        </span>
        <span className="dashboard-room-code">{room.code}</span>
      </span>
      <span className="dashboard-room-name">{room.name}</span>
      <span className="dashboard-room-host">
        {hosting ? "You’re hosting" : `Hosted by ${room.owner.displayName}`}
      </span>
      <span className="dashboard-room-meta">
        <span>{room._count.participants} of {room.maxParticipants} members</span>
        <span>Updated {formatUpdatedAt(room.updatedAt)}</span>
      </span>
      <span className="dashboard-room-open">Open room <span aria-hidden="true">→</span></span>
    </Link>
  );
}

function RoomSection({
  eyebrow,
  title,
  description,
  rooms,
  hosting = false,
  emptyMessage,
}: {
  eyebrow: string;
  title: string;
  description: string;
  rooms: DashboardRoom[];
  hosting?: boolean;
  emptyMessage: string;
}) {
  return (
    <section className="dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      {rooms.length > 0 ? (
        <div className="dashboard-room-grid">
          {rooms.map((room) => <RoomCard key={room.id} room={room} hosting={hosting} />)}
        </div>
      ) : (
        <div className="dashboard-empty-row">{emptyMessage}</div>
      )}
    </section>
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
        <Link className="brand" href="/dashboard" aria-label="Cineclub dashboard">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>Cineclub</span>
        </Link>
        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <Link href="/profile">Profile</Link>
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
            <Link className="button button-primary" href="/create">Create a room</Link>
            <Link className="button button-secondary" href="/join">Join with a code</Link>
          </div>
        </section>

        <RoomSection
          eyebrow="You’re the host"
          title="Rooms you’re hosting"
          description="Active rooms you created and control."
          rooms={rooms.hosting}
          hosting
          emptyMessage="You aren’t hosting an active room yet."
        />
        <RoomSection
          eyebrow="In progress"
          title="Rooms you’re currently in"
          description="Active rooms where you joined the crew."
          rooms={rooms.current}
          emptyMessage="You haven’t joined an active room yet."
        />
        <RoomSection
          eyebrow="The archive"
          title="Previous rooms"
          description="Completed movie nights you hosted or joined."
          rooms={rooms.previous}
          emptyMessage="Completed rooms will collect here."
        />
      </div>
    </main>
  );
}
