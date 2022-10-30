var map = new Map();


map.set({i:1,j:1},{desc:"one"});
map.set({i:2,j:2},{desc:"two"});
map.set({i:3,j:3},{desc:"three"});
map.set({i:4,j:4},{desc:"four"});


// console.log(map.get({i:1,j:2}))
map.set(1,undefined)
console.log(map)

function getM(k:any){
  map.forEach((value,key)=>{
    // console.log(key)
    // console.log(k)
    if(key==k)
    {
      console.log(value) ;
    }
  })
}
    

console.log(getM({i:1,j:1}))
console.log(map.get({i:1,j:1}))
console.log("============")

interface User {
  id: number;
  name: string;
  domain?: string;
  age?: number;
  isActive?: boolean;
}
let user: User = {
  id: 1,
  name: "infinitbility",
};
console.log(user)

//  Add element using key
user.domain = "infinitbility.com";
console.log("user", user);

user["isActive"] = true;
console.log("user", user);


