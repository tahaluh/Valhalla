"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/presentation/components/ui/badge";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/presentation/components/ui/table";

interface CategoryListItem {
  id: string;
  name: string;
  type: string;
  competitionLevel: string;
}

interface AdminCategoriesTabProps {
  categories: CategoryListItem[];
  eventId: string;
}

export function AdminCategoriesTab({ categories, eventId }: AdminCategoriesTabProps) {
  const utils = trpc.useUtils();
  const updateCategory = trpc.category.update.useMutation({
    onSuccess: () => utils.category.listByEvent.invalidate(eventId),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Categorias</h3>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Nível OBR</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Badge variant={category.type === "RESCUE" ? "default" : "secondary"}>
                      {category.type === "RESCUE" ? "Resgate" : "Artística"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <select
                      aria-label={`Nível OBR de ${category.name}`}
                      className="h-9 rounded-md border bg-white px-2 text-sm"
                      value={category.competitionLevel}
                      disabled={updateCategory.isPending}
                      onChange={(event) =>
                        updateCategory.mutate({
                          id: category.id,
                          competitionLevel: event.target.value as "NONE" | "LEVEL1" | "LEVEL2",
                        })
                      }
                    >
                      <option value="NONE">Não se aplica</option>
                      <option value="LEVEL1">Nível 1</option>
                      <option value="LEVEL2">Nível 2</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/view">Ver no telão</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
