// 📍 Area code (NPA) → "City, ST" so the dialer can show what region each of our Telnyx
// numbers presents as (Jon 2026-10-27: "put the area each phone number services... so we
// know what to manually select when dialing" for local presence). Covers the common US
// NPAs — heavy on our markets (TX, FL, CA, TN, OK, AZ). Unknown codes return null.
const NPA_GEO: Record<string, string> = {};
const add = (place: string, codes: string) => { for (const c of codes.split(/\s+/)) if (c) NPA_GEO[c] = place; };

// Texas
add("Houston, TX", "713 281 832 346 621");
add("Dallas, TX", "214 469 972 945");
add("Fort Worth, TX", "817 682");
add("San Antonio, TX", "210 726 830");
add("Austin, TX", "512 737");
add("El Paso, TX", "915");
add("Waco/Killeen, TX", "254");
add("Lubbock, TX", "806");
add("Corpus Christi, TX", "361");
add("Tyler/E. Texas, TX", "430 903");
add("Beaumont, TX", "409");
add("Abilene, TX", "325");
add("Texas", "972 940 936 979 956");
// Florida
add("Miami, FL", "305 786");
add("Fort Lauderdale, FL", "754 954");
add("West Palm Beach, FL", "561");
add("Orlando, FL", "407 321 689");
add("Tampa, FL", "813 656");
add("St. Petersburg, FL", "727");
add("Jacksonville, FL", "904");
add("Fort Myers/Naples, FL", "239");
add("Tallahassee, FL", "850");
add("Gainesville/Ocala, FL", "352");
add("Sarasota, FL", "941");
add("Daytona, FL", "386");
add("Pensacola, FL", "835");
add("Lakeland, FL", "863");
// California
add("Los Angeles, CA", "213 323 310 424 818 747 820 661");
add("San Diego, CA", "619 858 760 442");
add("San Francisco, CA", "415 628");
add("Oakland/E. Bay, CA", "510 341");
add("San Jose, CA", "408 669");
add("Sacramento, CA", "916 279");
add("Fresno, CA", "559");
add("Orange County, CA", "714 657 949");
add("Riverside/San Bernardino, CA", "909 951 840");
add("Long Beach, CA", "562");
add("Palm Springs, CA", "760");
add("Bakersfield, CA", "661");
add("Santa Barbara, CA", "805 820");
add("Oxnard/Ventura, CA", "805");
add("Stockton/Modesto, CA", "209 350");
add("Santa Rosa, CA", "707");
// Tennessee
add("Nashville, TN", "615 629");
add("Memphis, TN", "901");
add("Knoxville, TN", "865");
add("Chattanooga, TN", "423");
add("Jackson, TN", "731");
add("Clarksville, TN", "931");
// Oklahoma
add("Oklahoma City, OK", "405 572");
add("Tulsa, OK", "918 539");
add("Lawton/W. Oklahoma, OK", "580");
// Arizona
add("Phoenix, AZ", "602 480 623 820");
add("Tucson, AZ", "520");
add("Flagstaff/Yuma, AZ", "928");
// Other common metros
add("New York, NY", "212 646 332 917 718 347 929 516 631 934");
add("Atlanta, GA", "404 470 678 770 943");
add("Chicago, IL", "312 773 872 847 224 331 630 708 779 815");
add("Denver, CO", "303 720 983");
add("Las Vegas, NV", "702 725");
add("Seattle, WA", "206 253 425 564");
add("Portland, OR", "503 971");
add("Boston, MA", "617 857 781 339 508 774");
add("Philadelphia, PA", "215 267 445");
add("Pittsburgh, PA", "412 878");
add("Washington, DC", "202 771");
add("Charlotte, NC", "704 980");
add("Raleigh, NC", "919 984");
add("Nashville area, TN", "629");
add("Detroit, MI", "313 248 947 586 734");
add("Minneapolis, MN", "612 763 952 651");
add("Columbus, OH", "614 380");
add("Cleveland, OH", "216 440");
add("Cincinnati, OH", "513 283");
add("St. Louis, MO", "314 636 557");
add("Kansas City, MO", "816 975");
add("New Orleans, LA", "504");
add("Baton Rouge, LA", "225");
add("Birmingham, AL", "205 659");
add("Nashville/Louisville, KY", "502");
add("Indianapolis, IN", "317 463");
add("Salt Lake City, UT", "801 385");
add("Albuquerque, NM", "505");
add("Richmond, VA", "804");
add("Virginia Beach, VA", "757");
add("Baltimore, MD", "410 443 667");
add("Providence, RI", "401");
add("Hartford, CT", "860 959");

/** "City, ST" for a phone's area code, or null if unknown. Handles +1, 1-, formatted, etc. */
export function geoForPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const npa = digits.slice(0, 3);
  if (/^8(00|33|44|55|66|77|88)$/.test(npa)) return "Toll-free";
  return NPA_GEO[npa] ?? null;
}
