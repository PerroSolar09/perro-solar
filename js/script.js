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
/*==================================================
PERRO SOLAR · CUENTA REGRESIVA SILENCIO AL VOLVER
==================================================*/

document.addEventListener("DOMContentLoaded", () => {

    const countdown = document.getElementById("release-countdown");
    const video = document.getElementById("release-video");

    if (!countdown || !video) return;

    /*
    Estreno:

    7 de septiembre de 2026
    8:00 AM
    Hora de Bogotá / Colombia

    UTC-5
    */

    const releaseDate = new Date(
        "2026-09-07T08:00:00-05:00"
    );

    const daysElement = document.getElementById("days");
    const hoursElement = document.getElementById("hours");
    const minutesElement = document.getElementById("minutes");
    const secondsElement = document.getElementById("seconds");

    function updateCountdown() {

        const now = new Date();

        const difference =
            releaseDate.getTime() - now.getTime();

        /*
        Cuando llega el momento del estreno
        */

        if (difference <= 0) {

            countdown.style.opacity = "0";
            countdown.style.transform = "translateY(-20px)";

            setTimeout(() => {

                countdown.style.display = "none";

                video.classList.add("visible");

            }, 600);

            clearInterval(timer);

            return;
        }

        const days = Math.floor(
            difference / (1000 * 60 * 60 * 24)
        );

        const hours = Math.floor(
            (difference / (1000 * 60 * 60)) % 24
        );

        const minutes = Math.floor(
            (difference / (1000 * 60)) % 60
        );

        const seconds = Math.floor(
            (difference / 1000) % 60
        );

        daysElement.textContent =
            String(days).padStart(2, "0");

        hoursElement.textContent =
            String(hours).padStart(2, "0");

        minutesElement.textContent =
            String(minutes).padStart(2, "0");

        secondsElement.textContent =
            String(seconds).padStart(2, "0");

    }

    /*
    Ejecutar inmediatamente
    */

    updateCountdown();

    /*
    Actualizar cada segundo
    */

    const timer = setInterval(
        updateCountdown,
        1000
    );

}); 