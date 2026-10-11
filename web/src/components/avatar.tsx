import type { User } from "@/lib/api";
import { cn } from "@/lib/utils";

// A user's profile picture in a circle, or their initial if they haven't added one.
export function Avatar({ user, className, style }: { user: User; className?: string; style?: React.CSSProperties }) {
  return user.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element -- images come from the API server
    <img src={user.avatar} alt="" style={style} className={cn("shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span
      aria-hidden
      style={style}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground uppercase",
        className,
      )}
    >
      {user.name[0]}
    </span>
  );
}
