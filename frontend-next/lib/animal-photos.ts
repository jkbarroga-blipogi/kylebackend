import type { Row } from "./records";

const CAT_PHOTOS = [
  "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1495360010541-f48722b34f7d?auto=format&fit=crop&w=900&q=80",
] as const;

const DOG_PHOTOS = [
  "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=80",
] as const;

export function animalPhotoUrl(
  row: Record<string, unknown>,
  references: Record<string, Row[]> = {},
): string {
  if (typeof row.image_url === "string" && row.image_url.trim()) {
    return row.image_url.trim();
  }

  const breedRow = (references.breed ?? []).find(
    (entry) => String(entry.breed_id) === String(row.breed_id),
  );
  const nestedBreed =
    row.breed && typeof row.breed === "object"
      ? (row.breed as Record<string, unknown>)
      : null;
  const nestedSpecies =
    breedRow?.species && typeof breedRow.species === "object"
      ? (breedRow.species as Record<string, unknown>)
      : null;

  const hint = [
    row.species_name,
    row.breed_name,
    nestedBreed?.breed_name,
    breedRow?.breed_name,
    nestedSpecies?.species_name,
    row.animal_name,
  ]
    .map((item) => String(item ?? "").toLowerCase())
    .join(" ");

  const id = Math.max(1, Number(row.animal_id) || 1);
  if (/\b(cat|kitten|feline|puspin|persian|siamese|tabby)\b/.test(hint)) {
    return CAT_PHOTOS[(id - 1) % CAT_PHOTOS.length];
  }

  return DOG_PHOTOS[(id - 1) % DOG_PHOTOS.length];
}
