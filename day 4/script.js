
var xhr = new XMLHttpRequest();
xhr.open('GET', 'https://fakestoreapi.com/products');

var productsElement = document.getElementById('products');
var statusElement = document.getElementById('status');

function createTextElement(tagName, className, text) {
    var element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
}

function displayProducts(products) {
    products.forEach(function (product) {
        var card = document.createElement('article');
        card.className = 'product-card';

        var image = document.createElement('img');
        image.className = 'product-image';
        image.src = product.image;
        image.alt = product.title;
        image.loading = 'lazy';
        image.onerror = function () {
            image.alt = 'Image unavailable for ' + product.title;
            image.removeAttribute('src');
        };

        var rating = product.rating || {};
        var ratingElement = createTextElement(
            'p',
            'product-rating',
            'Rating: ' + (rating.rate ?? 'N/A') + ' / 5 (' +
                (rating.count ?? 'N/A') + ' reviews)'
        );

        card.append(
            image,
            createTextElement('p', 'product-category', 'Category: ' + product.category),
            createTextElement('h2', '', product.title),
            createTextElement('p', 'product-price', 'Price: $' + product.price),
            createTextElement('p', 'product-description', product.description),
            createTextElement('p', '', 'Product ID: ' + product.id),
            ratingElement
        );

        productsElement.appendChild(card);
    });
}

xhr.addEventListener('readystatechange', function () {
    if (xhr.readyState !== XMLHttpRequest.DONE) {
        return;
    }

    if (xhr.status !== 200) {
        statusElement.textContent = 'Could not load products. Please try again later.';
        console.error('Failed to fetch products. HTTP status:', xhr.status);
        return;
    }

    try {
        var products = JSON.parse(xhr.responseText);

        if (!Array.isArray(products)) {
            throw new Error('The products response is not an array.');
        }

        displayProducts(products);
        statusElement.textContent = products.length
            ? 'Showing ' + products.length + ' products.'
            : 'No products found.';
    } catch (error) {
        statusElement.textContent = 'Could not display products. The response was invalid.';
        console.error('Failed to parse the products response as JSON:', error);
    }
});

xhr.addEventListener('error', function () {
    statusElement.textContent = 'A network error occurred. Please check your connection.';
    console.error('A network error occurred while fetching products.');
});

xhr.send();