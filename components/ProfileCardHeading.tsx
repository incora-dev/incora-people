import type { ReactNode } from "react";

export function ProfileCardHeading({
  title,
  emoji,
  actions,
}: {
  title: ReactNode;
  emoji?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="panel-heading profile-card-heading">
      <h2>
        {emoji && (
          <span className="profile-card-heading-emoji" aria-hidden="true">
            {emoji}
          </span>
        )}
        {title}
      </h2>
      {actions && <div className="profile-card-heading-actions">{actions}</div>}
    </div>
  );
}
