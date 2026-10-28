import { useTranslation } from "react-i18next";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { DeleteConfirm } from "./DeleteConfirm";

export function RowActions({
  onEdit,
  onDelete,
  deleteTitle,
  deleteDescription,
  canDelete = true,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleteTitle: string;
  deleteDescription: string;
  canDelete?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          {t("common.edit")}
        </DropdownMenuItem>
        {canDelete && (
          <DeleteConfirm
            trigger={
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("common.delete")}
              </DropdownMenuItem>
            }
            title={deleteTitle}
            description={deleteDescription}
            onConfirm={onDelete}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
