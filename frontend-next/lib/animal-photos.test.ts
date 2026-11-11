import { describe, expect, it } from "vitest";
import { animalPhotoUrl } from "./animal-photos";

describe("animalPhotoUrl", () => {
  it("returns the uploaded image_url when present", () => {
    expect(
      animalPhotoUrl({
        animal_id: 2,
        animal_name: "Geolee",
        image_url: "data:image/jpeg;base64,abc123",
      }),
    ).toBe("data:image/jpeg;base64,abc123");
  });

  it("returns a deterministic fallback photo when image_url is null or empty", () => {
    const urlA = animalPhotoUrl({
      animal_id: 3,
      animal_name: "Uri",
      breed_id: 3,
      image_url: null,
    });
    const urlB = animalPhotoUrl({
      animal_id: 5,
      animal_name: "Dogle",
      breed_id: 3,
      image_url: "",
    });
    expect(urlA).toMatch(/^https:\/\/images\.unsplash\.com\//);
    expect(urlB).toMatch(/^https:\/\/images\.unsplash\.com\//);
    expect(urlA).not.toBe(urlB);
  });

  it("picks a cat photo when species or breed indicates a cat", () => {
    const url = animalPhotoUrl(
      { animal_id: 1, animal_name: "Luna", breed_id: 1, image_url: null },
      {
        breed: [{ breed_id: 1, species_id: 1, breed_name: "Puspin", species: { species_name: "Cat" } }],
      },
    );
    expect(url).toContain("photo-1514888286974-6c03e2ca1dba");
  });
});
