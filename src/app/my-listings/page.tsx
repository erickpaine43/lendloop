"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { RequireAuth } from "@/components/RequireAuth";
import { ToolForm } from "@/components/ToolForm";
import { Badge, Button, Card, Empty, ErrorText, Loading, PageTitle } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/labels";

export default function MyListingsPage() {
  return (
    <RequireAuth>
      <MyListings />
    </RequireAuth>
  );
}

function MyListings() {
  const tools = useQuery(api.tools.myListings);
  const create = useMutation(api.tools.create);

  return (
    <>
      <PageTitle>My listings</PageTitle>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          {tools === undefined ? (
            <Loading />
          ) : tools.length === 0 ? (
            <Empty>You haven&apos;t listed any tools yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {tools.map((t) => (
                <li key={t._id}>
                  <Listing tool={t} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <Card className="h-fit">
          <h2 className="mb-3 font-medium">List a tool</h2>
          <ToolForm submitLabel="List tool" onSubmit={(v) => create(v)} />
        </Card>
      </div>
    </>
  );
}

function Listing({ tool }: { tool: Doc<"tools"> & { available: boolean } }) {
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  if (editing) {
    return (
      <Card>
        <ToolForm
          initial={{ name: tool.name, category: tool.category, condition: tool.condition, description: tool.description }}
          submitLabel="Save"
          onSubmit={(v) => update({ toolId: tool._id, ...v })}
          onCancel={() => setEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium">{tool.name}</h2>
        <Badge className={tool.available ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}>
          {tool.available ? "Available" : "On loan"}
        </Badge>
      </div>
      <p className="text-sm text-zinc-500">
        {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]} condition
      </p>
      {tool.description && <p className="text-sm">{tool.description}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm(`Delete "${tool.name}"? Pending requests will be declined.`)) return;
            setError("");
            try {
              await remove({ toolId: tool._id });
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          Delete
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
