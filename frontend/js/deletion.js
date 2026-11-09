import { canWrite } from "./resources.js";
import { deleteOutcome, recordName } from "./records.js";
import { $, message } from "./ui.js";

export function createDeletion(client, onDeleted) {
  let selected = null;
  let busy = false;
  const dialog = $("delete-dialog");
  $("delete-cancel").onclick = () => dialog.close();
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  $("delete-form").onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !selected || !canWrite(client.session?.role, selected.resource.key)) return;
    busy = true;
    $("delete-confirm").disabled = true;
    $("delete-cancel").disabled = true;
    const { resource, row } = selected;
    const id = row[resource.idKey];
    message("delete-message", "Deleting record...");
    try {
      const result = await client.request(`${resource.path}/${id}`, { method: "DELETE" });
      const outcome = deleteOutcome(resource, result, id);
      dialog.close();
      await onDeleted(outcome);
    } catch (error) {
      if (error.status !== 401) message("delete-message", error.message, "error");
    } finally {
      busy = false;
      $("delete-confirm").disabled = false;
      $("delete-cancel").disabled = false;
    }
  };
  return (resource, row) => {
    if (!canWrite(client.session?.role, resource.key)) return;
    selected = { resource, row };
    $("delete-title").textContent = `Delete ${resource.singular}?`;
    $("delete-description").textContent = `${recordName(resource, row)} (${row[resource.idKey]}) will be deleted. This cannot be undone.`
      + (["adoption", "adoption-application"].includes(resource.key) ? " Related animal availability can change. Review its records afterward." : " Referenced records may prevent deletion.");
    message("delete-message", "");
    dialog.showModal();
    $("delete-cancel").focus();
  };
}
