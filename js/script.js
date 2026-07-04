document.addEventListener("DOMContentLoaded", () => {

    const elementos = document.querySelectorAll(".fade-up");

    elementos.forEach((elemento, index) => {

        setTimeout(() => {
            elemento.classList.add("visible");
        }, index * 300);

    });

});
