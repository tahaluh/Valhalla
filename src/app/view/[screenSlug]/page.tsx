import DisplayClient from "../DisplayClient";

export const dynamic = "force-dynamic";

export default async function NamedDisplayPage({
  params,
}: {
  params: Promise<{ screenSlug: string }>;
}) {
  const { screenSlug } = await params;
  return <DisplayClient screenSlug={screenSlug} />;
}
