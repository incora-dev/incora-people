"use client";

import Link from "next/link";
import { Box, ExternalLink } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { ProfileCardHeading } from "@/components/ProfileCardHeading";

type EmployeeAsset = {
  id: number;
  name: string;
  assetTag: string;
  category: string;
  status: string;
  serialNumber: string;
  note: string;
  updatedAt: string;
  latestEvent: { eventType: string; createdAt: string } | null;
};

export function EmployeeAssets({
  assets,
  canManage,
}: {
  assets: EmployeeAsset[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  return (
    <article className="panel span-profile-grid employee-assets" id="assets">
      <ProfileCardHeading
        title={t("Assets")}
        emoji="📦"
        actions={
          canManage ? (
            <Link className="button ghost-button" href="/assets">
              {t("Manage assets")} <ExternalLink size={14} />
            </Link>
          ) : undefined
        }
      />
      <p className="employee-assets-description">
        {t("Equipment assigned to this employee")}
      </p>
      <div className="employee-asset-grid">
        {assets.map((asset) => (
          <section key={asset.id}>
            <span className={`asset-icon ${asset.status}`}>
              <Box size={19} />
            </span>
            <div>
              <strong>{asset.name}</strong>
              <span>
                {asset.assetTag} · {t(asset.category)}
              </span>
              {asset.serialNumber && (
                <small>
                  {t("Serial number")} · {asset.serialNumber}
                </small>
              )}
              {asset.note && <small>{asset.note}</small>}
            </div>
            <span className={`status-pill ${asset.status}`}>
              {t(asset.status)}
            </span>
          </section>
        ))}
        {assets.length === 0 && (
          <p className="muted profile-empty-state">
            {t("No equipment is assigned to this employee.")}
          </p>
        )}
      </div>
    </article>
  );
}
