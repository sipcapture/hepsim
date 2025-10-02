/**
 * Function to generate a Random String with x length
 * @param {integer} length 
 * @returns 
 */
function generateRandomString(length = 10) {
    let result = ''
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let charactersLength = characters.length
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength))
    }
    return result
}

/**
 * Function to generate a Random Branch String
 * @returns {string} Random Branch String
 */
function generateRandomBranch() {
    return 'z9hG4bK' + generateRandomString(8)
}

/**
 * Function to generate a random interger between min and max
 * @param {number} min 
 * @param {number} max 
 * @returns {integer} Random Integer between min and max
 */
function getRandomInteger(min, max) {
    return parseInt(Math.floor(Math.random() * (max - min + 1)) + min)
}

/**
 * Function to generate a random float between min and max
 * @param {number} min
 * @param {number} max
 * @returns {float} Random Float between min and max
 */
function getRandomFloat(min, max) {
    return parseFloat(parseFloat(Math.random() * (max - min) + min).toFixed(3))
}

/**
 * Function to generate a random phone number with +1 prefix
 * @returns {string} Random Phone Number
 */
function getRandomPhoneNumber() {
    return '+1' + getRandomInteger(1000000000, 9999999999)
}

function getRandomByte() {
  return Math.round(Math.random()*254);
}

function getRandomPublicIP() {
  return getRandomIp(false);
}

function getRandomPrivateIP() {
    return getRandomIp(true);
}

/**
 * Generates a random IP address in the format of IPv4 (xxx.xxx.xxx.xxx).
 * Uses the getRandomByte function to generate each octet of the IP address.
 * @param {boolean} privateIp - If true, the function will generate a private IP address.
 * If false, it will generate a public IP address.
 * @returns {string} A randomly generated IPv4 address.
 */
function getRandomIp (privateIp) {
  var ip = getRandomByte() +'.' +
           getRandomByte() +'.' +
           getRandomByte() +'.' +
           getRandomByte();
  if (isPrivate(ip) && privateIp) return ip;
  return ip;
}

/**
 * Checks if the given IP address is a private IP address.
 * @param {string} ip 
 * @returns {boolean} Returns true if the IP address is private, false otherwise.
 */
function isPrivate(ip) {
  return /^10\.|^192\.168\.|^172\.16\.|^172\.17\.|^172\.18\.|^172\.19\.|^172\.20\.|^172\.21\.|^172\.22\.|^172\.23\.|^172\.24\.|^172\.25\.|^172\.26\.|^172\.27\.|^172\.28\.|^172\.29\.|^172\.30\.|^172\.31\./.test(ip);
}

/**
 * Function to generate a random call ID.
 * @returns {string} A random call ID in the format 'hepsim-' followed by a 6-character random string.
 */
function getRandomCallId () {
  return 'hepsim-' + generateRandomString(10);
}

/**
 * Function to find the 'next' location in an array of locations.
 * @param {array} locations - An array of locations.
 * @param {string} currentLocation - The current location.
 * @returns {string} The next location in the array, or the current location if it's the last one.
 */
function getNextLocation(locations, currentLocation) {
  let currentIndex = locations.indexOf(currentLocation);
  if (currentIndex === -1) return currentLocation;
  return locations[(currentIndex + 1) % locations.length];
}

/**
 * Function to find the 'previous' location in an array of locations.
 * @param {array} locations - An array of locations.
 * @param {string} currentLocation - The current location.
 * @returns {string} The previous location in the array, or the current location if it's the first one.
 */
function getPreviousLocation(locations, currentLocation) {
  let currentIndex = locations.indexOf(currentLocation);
  if (currentIndex === -1) return currentLocation;
  return locations[(currentIndex - 1 + locations.length) % locations.length];
}

/**
 * Function to pick a random element from an array.
 * @param {Array} array - The array to pick from.
 * @returns {*} A random element from the array, or null if the array is empty.
 */
function pickRandomElement(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}

export {
    generateRandomString,
    generateRandomBranch,
    getRandomInteger,
    getRandomFloat,
    getRandomPhoneNumber,
    getRandomPublicIP,
    getRandomPrivateIP,
    getRandomCallId,
    getNextLocation,
    getPreviousLocation,
    pickRandomElement,
}