const posters = document.querySelectorAll(".event-poster");

const lightbox = document.querySelector(".lightbox");
const lightboxImage = document.querySelector(".lightbox-image");

const closeBtn = document.querySelector(".close");
const prevBtn = document.querySelector(".prev");
const nextBtn = document.querySelector(".next");

let gallery = [];
let current = 0;

// Abrir galería
posters.forEach((poster) => {

    poster.addEventListener("click", () => {

        if (!poster.dataset.gallery) return;

        gallery = poster.dataset.gallery
            .split(",")
            .map(img => img.trim())
            .filter(img => img !== "");

        if (gallery.length === 0) return;

        current = 0;

        lightboxImage.src = gallery[current];

        lightbox.classList.add("active");

    });

});

// Siguiente
nextBtn.addEventListener("click", () => {

    current++;

    if (current >= gallery.length) {

        current = 0;

    }

    lightboxImage.src = gallery[current];

});

// Anterior
prevBtn.addEventListener("click", () => {

    current--;

    if (current < 0) {

        current = gallery.length - 1;

    }

    lightboxImage.src = gallery[current];

});

// Cerrar
closeBtn.addEventListener("click", () => {

    lightbox.classList.remove("active");

});

// Cerrar haciendo clic fuera
lightbox.addEventListener("click", (e) => {

    if (e.target === lightbox) {

        lightbox.classList.remove("active");

    }

});

// Cerrar con ESC
document.addEventListener("keydown", (e) => {

    if (e.key === "Escape") {

        lightbox.classList.remove("active");

    }

});
//==================================================
// MENÚ HAMBURGUESA
//==================================================

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("nav");

if (menuToggle && nav) {

    menuToggle.addEventListener("click", () => {

        nav.classList.toggle("active");

    });

    // Cerrar menú al seleccionar una opción
    nav.querySelectorAll("a").forEach((link) => {

        link.addEventListener("click", () => {

            nav.classList.remove("active");

        });

    });

}