import React, { useState, useEffect } from "react";

const FeeExplanation = () => {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    const isVisited = localStorage.getItem("isVisited");
    if (!isVisited) {
      setShowMessage(true);
    }
  }, []);

  const handleClose = () => {
    setShowMessage(false);
    localStorage.setItem("isVisited", "true");
  };

  return (
    <>
      {showMessage && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>About Bridging Fee</h2>
            <p>To the XDC network, a 0.1% bridge fee is charged.</p>
            <p>To the BNB network, a 0.1% bridge fee is charged along with a network fee of 5 CPH.</p>
            <p>To the ETH network, a 0.1% bridge fee is charged along with a network fee of 700 CPH.</p>
            <p>
              These fees will be adjusted in line with increases in the price
              of CPH.
            </p>
            <p>
              Once a certain amount of profit is accumulated, we are
              considering redistributing it to the community or organizing
              airdrop events.
            </p>
            <p>Let’s have some fun on Cypherium! ☀️</p>
            <button className="btn btn-primary" onClick={handleClose}>
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default FeeExplanation;
