alert("Welcome to my first site")

function exchange(egp) {
    return egp / 31;
}

const egpNumber = Number(prompt("EGP ?"))
alert(exchange(egpNumber))

function nameValid(nameValue) {
    if (typeof nameValue == 'string') {
        return nameValue
    }
    return null
}

function numberValid(numberValue) {
    const str = String(numberValue).trim();

    if (str.length > 11)
        return numberValue;
    return null;
}

function yearValid(yearValue) {
    if (yearValue > 1900)
        return yearValue
    return null
}

function colorValid(colorValue) {
    if (colorValue == 'red' || colorValue == 'green' || colorValue == 'blue')
        return colorValue
    return null
}

const username = prompt("Enter Your Name?")
const number = Number(prompt("Enter Your Phone Number?"))
const birthYear = Number(prompt("Enter Your Birth Year?"))
const color = (prompt("Enter Your Color?"))

alert(nameValid(username) + '\n' + numberValid(number) + '\n' + yearValid(birthYear) + '\n' + colorValid(color))
(===)
function equalFun(a, b, c) {
    if (a == b && a == c)
        return 3
    else if ((a == b && a != c) || (a == c && b != c))
        return 2
    else if (a != b && a != c && b != c)
        return 0
}

const firstNum = Number(prompt("first Num?"))
const secondNum = Number(prompt("second Num?"))
const thirdNum = Number(prompt("third Num?"))

alert(equalFun(firstNum, secondNum, thirdNum))