console.log("SCRIPT NUEVO CARGADO");

/*==================================================
ANIMACIONES AL CARGAR
==================================================*/

document.addEventListener("DOMContentLoaded", () => {

    const elementos = document.querySelectorAll(".fade-up");

    elementos.forEach((elemento, index) => {

        setTimeout(() => {

            elemento.classList.add("visible");

        }, index * 300);

    });

});


/*==================================================
HEADER AL HACER SCROLL
==================================================*/

window.addEventListener("scroll", () => {

    const header = document.querySelector("header");

    if (!header) return;

    if (window.scrollY > 80) {

        header.classList.add("scrolled");

    } else {

        header.classList.remove("scrolled");

    }

});


/*==================================================
LIGHTBOX GALERÍA
==================================================*/

const posters = document.querySelectorAll(".poster-button");

const lightbox = document.querySelector(".lightbox");

const lightboxImage = document.querySelector(".lightbox-image");

const closeButton = document.querySelector(".close-lightbox");

const prevButton = document.querySelector(".prev-photo");

const nextButton = document.querySelector(".next-photo");


if (

    posters.length > 0 &&
    lightbox &&
    lightboxImage &&
    closeButton &&
    prevButton &&
    nextButton

) {

    let images = [];

    let currentIndex = 0;

    posters.forEach((poster) => {

        poster.addEventListener("click", () => {

            images = poster.dataset.gallery.split(",");

            images = images.map(img => img.trim());

            currentIndex = 0;

            lightboxImage.src = images[currentIndex];

            lightbox.classList.add("active");

        });

    });


    nextButton.addEventListener("click", () => {

        currentIndex++;

        if (currentIndex >= images.length) {

            currentIndex = 0;

        }

        lightboxImage.src = images[currentIndex];

    });


    prevButton.addEventListener("click", () => {

        currentIndex--;

        if (currentIndex < 0) {

            currentIndex = images.length - 1;

        }

        lightboxImage.src = images[currentIndex];

    });


    closeButton.addEventListener("click", () => {

        lightbox.classList.remove("active");

    });


    lightbox.addEventListener("click", (e) => {

        if (e.target === lightbox) {

            lightbox.classList.remove("active");

        }

    });

}


/*==================================================
MENÚ HAMBURGUESA
==================================================*/

const menuToggle = document.querySelector(".menu-toggle");

const nav = document.querySelector("nav");


if (menuToggle && nav) {

    menuToggle.addEventListener("click", () => {

        nav.classList.toggle("active");

        menuToggle.classList.toggle("active");

    });


    document.querySelectorAll("nav a").forEach((link) => {

        link.addEventListener("click", () => {

            nav.classList.remove("active");

            menuToggle.classList.remove("active");

        });

    });

}