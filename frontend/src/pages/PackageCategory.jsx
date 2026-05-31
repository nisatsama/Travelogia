import axios from "axios";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

function PackageCategory() {
  const { category } = useParams();

  const [packages, setPackages] = useState([]);

  useEffect(() => {
    axios
      .get(`http://localhost:8080/packages/category/${category}`)
      .then((res) => setPackages(res.data));
  }, [category]);

  return (
    <div>
      <h1>{category} Packages</h1>

      {packages.map((item) => (
        <div key={item._id}>
          <img src={item.image.url} width="300" />

          <h2>{item.title}</h2>

          <p>{item.description}</p>

          <h3>${item.price}</h3>
        </div>
      ))}
    </div>
  );
}

export default PackageCategory;
